from __future__ import annotations

import base64
import logging
import os
import zlib
from collections import Counter
from collections.abc import Sequence
from functools import cached_property
from typing import Any, Literal

import msgpack
import sentry_sdk
import zstandard
from sentry_ophio.enhancers import Cache as RustCache
from sentry_ophio.enhancers import Component as RustFrame
from sentry_ophio.enhancers import Enhancements as RustEnhancements

from sentry.grouping.component import FrameGroupingComponent, StacktraceGroupingComponent
from sentry.stacktraces.functions import set_in_app
from sentry.utils.safe import get_path, set_path

from .exceptions import InvalidEnhancerConfig
from .matchers import create_match_frame
from .parser import parse_enhancements
from .rules import EnhancementRule

logger = logging.getLogger(__name__)

# NOTE: The 1_000 here is pretty arbitrary. Our builtin base enhancements have about ~300 rules,
# So this leaves quite a bit of headroom for custom enhancement rules as well.
RUST_CACHE = RustCache(1_000)

VERSIONS = [2]
LATEST_VERSION = VERSIONS[-1]

VALID_PROFILING_MATCHER_PREFIXES = (
    "stack.abs_path",
    "path",  # stack.abs_path alias
    "stack.module",
    "module",  # stack.module alias
    "stack.function",
    "function",  # stack.function alias
    "stack.package",
    "package",  # stack.package
)
VALID_PROFILING_ACTIONS_SET = frozenset(["+app", "-app"])


def merge_rust_enhancements(
    bases: list[str], rust_enhancements: RustEnhancements
) -> RustEnhancements:
    """
    This will merge the parsed enhancements together with the `bases`.
    It pretty much concatenates all the rules in `bases` (in order) together
    with all the rules in the incoming `rust_enhancements`.
    """
    merged_rust_enhancements = RustEnhancements.empty()
    for base_id in bases:
        base = ENHANCEMENT_BASES.get(base_id)
        if base:
            merged_rust_enhancements.extend_from(base.rust_enhancements)
    merged_rust_enhancements.extend_from(rust_enhancements)
    return merged_rust_enhancements


def get_rust_enhancements(
    source: Literal["config_structure", "config_string"], input: str | bytes
) -> RustEnhancements:
    """
    Parses ``RustEnhancements`` from either a msgpack-encoded `config_structure`,
    or from the text representation called `config_string`.
    """
    try:
        if source == "config_structure":
            assert isinstance(input, bytes)
            return RustEnhancements.from_config_structure(input, RUST_CACHE)
        else:
            assert isinstance(input, str)
            return RustEnhancements.parse(input, RUST_CACHE)
    except RuntimeError as e:  # Rust bindings raise parse errors as `RuntimeError`
        raise InvalidEnhancerConfig(str(e))


# TODO: Convert this into a typeddict in ophio
RustExceptionData = dict[str, bytes | None]


def make_rust_exception_data(
    exception_data: dict[str, Any] | None,
) -> RustExceptionData:
    exception_data = exception_data or {}
    rust_data = {
        "type": exception_data.get("type"),
        "value": exception_data.get("value"),
        "mechanism": get_path(exception_data, "mechanism", "type"),
    }

    # Convert string values to bytes
    for key, value in rust_data.items():
        if isinstance(value, str):
            rust_data[key] = value.encode("utf-8")

    return RustExceptionData(
        ty=rust_data["type"],
        value=rust_data["value"],
        mechanism=rust_data["mechanism"],
    )


def is_valid_profiling_matcher(matchers: list[str]) -> bool:
    for matcher in matchers:
        if not matcher.startswith(VALID_PROFILING_MATCHER_PREFIXES):
            return False
    return True


def is_valid_profiling_action(action: str) -> bool:
    return action in VALID_PROFILING_ACTIONS_SET


def keep_profiling_rules(config: str) -> str:
    filtered_rules = []
    if config is None or config == "":
        return ""
    for rule in config.splitlines():
        rule = rule.strip()
        if rule == "" or rule.startswith("#"):  # ignore comment lines
            continue
        *matchers, action = rule.split()
        if is_valid_profiling_matcher(matchers) and is_valid_profiling_action(action):
            filtered_rules.append(rule)
    return "\n".join(filtered_rules)


class Enhancements:
    # NOTE: You must add a version to ``VERSIONS`` any time attributes are added
    # to this class, s.t. no enhancements lacking these attributes are loaded
    # from cache.
    # See ``GroupingConfigLoader._get_enhancements`` in src/sentry/grouping/api.py.

    def __init__(
        self,
        rules: list[EnhancementRule],
        rust_enhancements: RustEnhancements,
        version: int | None = None,
        bases: list[str] | None = None,
        id: str | None = None,
    ):
        self.id = id
        self.rules = rules
        self.version = version or LATEST_VERSION
        self.bases = bases or []

        self.rust_enhancements = merge_rust_enhancements(self.bases, rust_enhancements)

    def apply_category_and_updated_in_app_to_frames(
        self,
        frames: Sequence[dict[str, Any]],
        platform: str,
        exception_data: dict[str, Any],
    ) -> None:
        """
        Apply enhancement rules to each frame, adding a category (if any) and updating the `in_app`
        value if necessary.

        Both the category and `in_app` data will be used during grouping. The `in_app` values will
        also be persisted in the saved event, so they can be used in the UI and when determining
        things like suspect commits and suggested assignees.
        """
        # TODO: Fix this type to list[MatchFrame] once it's fixed in ophio
        match_frames: list[Any] = [create_match_frame(frame, platform) for frame in frames]
        rust_exception_data = make_rust_exception_data(exception_data)

        category_and_in_app_results = self.rust_enhancements.apply_modifications_to_frames(
            match_frames, rust_exception_data
        )

        for frame, (category, in_app) in zip(frames, category_and_in_app_results):
            if in_app is not None:
                # If the `in_app` value changes as a result of this call, the original value (in
                # integer form) will be added to `frame.data` under the key "orig_in_app"
                set_in_app(frame, in_app)
            if category is not None:
                set_path(frame, "data", "category", value=category)

    def assemble_stacktrace_component(
        self,
        variant_name: str,
        frame_components: list[FrameGroupingComponent],
        frames: list[dict[str, Any]],
        platform: str | None,
        exception_data: dict[str, Any] | None = None,
    ) -> StacktraceGroupingComponent:
        """
        This assembles a `stacktrace` grouping component out of the given
        `frame` components and source frames.

        This also handles cases where the entire stacktrace should be discarded.
        """
        # TODO: Fix this type to list[MatchFrame] once it's fixed in ophio
        match_frames: list[Any] = [create_match_frame(frame, platform) for frame in frames]

        rust_frames = [RustFrame(contributes=c.contributes) for c in frame_components]
        rust_exception_data = make_rust_exception_data(exception_data)

        # Modify the rust frames by applying +group/-group rules and getting hints for both those
        # changes and the `in_app` changes applied by earlier in the ingestion process by
        # `apply_category_and_updated_in_app_to_frames`. Also, get `hint` and `contributes` values
        # for the overall stacktrace (returned in `rust_results`).
        rust_stacktrace_results = self.rust_enhancements.assemble_stacktrace_component(
            match_frames, rust_exception_data, rust_frames
        )

        # Tally the number of each type of frame in the stacktrace. Later on, this will allow us to
        # both collect metrics and use the information in decisions about whether to send the event
        # to Seer
        frame_counts: Counter[str] = Counter()

        # Update frame components with results from rust
        for frame_component, rust_frame in zip(frame_components, rust_frames):
            # TODO: Remove the first condition once we get rid of the legacy config
            if (
                not (self.bases and self.bases[0].startswith("legacy"))
                and variant_name == "app"
                and not frame_component.in_app
            ):
                # System frames should never contribute in the app variant, so force
                # `contribtues=False`, regardless of the rust results. Use the rust hint if it
                # explains the `in_app` value (but not if it explains the `contributing` value,
                # because we're ignoring that)
                #
                # TODO: Right now, if stacktrace rules have modified both the `in_app` and
                # `contributes` values, then the hint you get back from the rust enhancers depends
                # on the order in which those changes happened, which in turn depends on both the
                # order of stacktrace rules and the order of the actions within a stacktrace rule.
                # Ideally we'd get both hints back.
                hint = (
                    rust_frame.hint
                    if rust_frame.hint and rust_frame.hint.startswith("marked out of app")
                    else frame_component.hint
                )
                frame_component.update(contributes=False, hint=hint)
            elif variant_name == "system":
                # We don't need hints about marking frames in or out of app in the system stacktrace
                # because such changes don't actually have an effect there
                hint = (
                    rust_frame.hint
                    if rust_frame.hint
                    and not rust_frame.hint.startswith("marked in-app")
                    and not rust_frame.hint.startswith("marked out of app")
                    else frame_component.hint
                )
                frame_component.update(contributes=rust_frame.contributes, hint=hint)
            else:
                frame_component.update(contributes=rust_frame.contributes, hint=rust_frame.hint)

            # Add this frame to our tally
            key = f"{"in_app" if frame_component.in_app else "system"}_{"contributing" if frame_component.contributes else "non_contributing"}_frames"
            frame_counts[key] += 1

        # Because of the special case above, in which we ignore the rust-derived `contributes` value
        # for certain frames, it's possible for the rust-derived `contributes` value for the overall
        # stacktrace to be wrong, too (if in the process of ignoring rust we turn a stacktrace with
        # at least one contributing frame into one without any). So we need to special-case here as
        # well.
        #
        # TODO: Remove the first condition once we get rid of the legacy config
        if (
            not (self.bases and self.bases[0].startswith("legacy"))
            and variant_name == "app"
            and frame_counts["in_app_contributing_frames"] == 0
        ):
            stacktrace_contributes = False
            stacktrace_hint = None
        else:
            stacktrace_contributes = rust_stacktrace_results.contributes
            stacktrace_hint = rust_stacktrace_results.hint

        stacktrace_component = StacktraceGroupingComponent(
            values=frame_components,
            hint=stacktrace_hint,
            contributes=stacktrace_contributes,
            frame_counts=frame_counts,
        )

        return stacktrace_component

    def _to_config_structure(self) -> list[Any]:
        # TODO: Can we switch this to a tuple so we can type it more exactly?
        return [
            self.version,
            self.bases,
            [rule._to_config_structure(self.version) for rule in self.rules],
        ]

    @cached_property
    def base64_string(self) -> str:
        """A base64 string representation of the enhancements object"""
        pickled = msgpack.dumps(self._to_config_structure())
        compressed_pickle = zstandard.compress(pickled)
        base64_bytes = base64.urlsafe_b64encode(compressed_pickle).strip(b"=")
        base64_str = base64_bytes.decode("ascii")
        return base64_str

    @classmethod
    def _from_config_structure(
        cls,
        data: list[Any],
        rust_enhancements: RustEnhancements,
    ) -> Enhancements:
        version, bases, rules = data
        if version not in VERSIONS:
            raise ValueError("Unknown version")
        return cls(
            rules=[EnhancementRule._from_config_structure(rule, version=version) for rule in rules],
            rust_enhancements=rust_enhancements,
            version=version,
            bases=bases,
        )

    @classmethod
    def from_base64_string(cls, base64_string: str | bytes) -> Enhancements:
        """Convert a base64 string into an `Enhancements` object"""
        bytes_str = (
            base64_string.encode("ascii", "ignore")
            if isinstance(base64_string, str)
            else base64_string
        )
        padded_bytes = bytes_str + b"=" * (4 - (len(bytes_str) % 4))
        try:
            compressed_pickle = base64.urlsafe_b64decode(padded_bytes)

            if compressed_pickle.startswith(b"\x28\xb5\x2f\xfd"):
                pickled = zstandard.decompress(compressed_pickle)
            else:
                pickled = zlib.decompress(compressed_pickle)

            rust_enhancements = get_rust_enhancements("config_structure", pickled)
            config_structure = msgpack.loads(pickled, raw=False)

            return cls._from_config_structure(config_structure, rust_enhancements)
        except (LookupError, AttributeError, TypeError, ValueError) as e:
            raise ValueError("invalid stack trace rule config: %s" % e)

    @classmethod
    @sentry_sdk.tracing.trace
    def from_rules_text(
        cls, rules_text: str, bases: list[str] | None = None, id: str | None = None
    ) -> Enhancements:
        """Create an `Enhancements` object from a text blob containing stacktrace rules"""
        rust_enhancements = get_rust_enhancements("config_string", rules_text)

        rules = parse_enhancements(rules_text)

        return Enhancements(
            rules,
            rust_enhancements=rust_enhancements,
            bases=bases,
            id=id,
        )


def _load_configs() -> dict[str, Enhancements]:
    enhancement_bases = {}
    configs_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), "enhancement-configs")
    for filename in os.listdir(configs_dir):
        if filename.endswith(".txt"):
            with open(os.path.join(configs_dir, filename), encoding="utf-8") as f:
                # Strip the extension
                filename = filename.replace(".txt", "")
                # We cannot use `:` in filenames on Windows but we already have ids with
                # `:` in their names hence this trickery.
                filename = filename.replace("@", ":")
                enhancements = Enhancements.from_rules_text(f.read(), id=filename)
                enhancement_bases[filename] = enhancements
    return enhancement_bases


ENHANCEMENT_BASES = _load_configs()
del _load_configs

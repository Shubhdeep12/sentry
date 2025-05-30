from .base import BasePage
from .global_selection import GlobalSelectionPage
from .issue_details import IssueDetailsPage


class IssueListPage(BasePage):
    def __init__(self, browser, client):
        super().__init__(browser)
        self.client = client
        self.global_selection = GlobalSelectionPage(browser)

    def visit_issue_list(self, org, query=""):
        self.browser.get(f"/organizations/{org}/issues/{query}")
        self.wait_until_loaded()

    def wait_for_stream(self):
        self.browser.wait_until('[data-test-id="event-issue-header"]', timeout=20)

    def select_issue(self, position):
        # Must hover over the row to show the checkbox
        self.browser.move_to(f'[data-test-id="group"]:nth-child({position})')
        self.browser.click(f'[data-test-id="group"]:nth-child({position}) input[type="checkbox"]')

    def navigate_to_issue(self, position):
        self.browser.click(f'[data-test-id="group"]:nth-child({position}) a')
        self.browser.wait_until(".group-detail")
        self.issue_details = IssueDetailsPage(self.browser, self.client)

    def resolve_issues(self):
        self.browser.click('[aria-label="Resolve"]')

    def wait_for_issue_removal(self):
        self.browser.click_when_visible('[data-test-id="toast-success"]')
        self.browser.wait_until_not('[data-test-id="toast-success"]')

    def wait_for_issue(self):
        self.browser.wait_until('[data-test-id="group"]')

    def find_resolved_issues(self):
        return self.browser.elements('[data-test-id="resolved-issue"]')

    def archive_issues(self):
        self.browser.click('[aria-label="Archive"]')

    def delete_issues(self):
        self.browser.click('[aria-label="More issue actions"]')
        self.browser.wait_until('[data-test-id="delete"]')
        self.browser.click('[data-test-id="delete"]')
        self.browser.click('[data-test-id="confirm-button"]')

    def merge_issues(self):
        # Merge button gets put into an overflow menu for small viewports
        if self.browser.element_exists('[aria-label="Merge Selected Issues"]'):
            self.browser.click('[aria-label="Merge Selected Issues"]')
            self.browser.click('[data-test-id="confirm-button"]')
        else:
            self.browser.click('[aria-label="More issue actions"]')
            self.browser.wait_until('[data-test-id="merge"]')
            self.browser.click('[data-test-id="merge"]')
            self.browser.click('[data-test-id="confirm-button"]')

    def mark_reviewed_issues(self):
        # Marked reviewed button gets put into an overflow menu for small viewports
        if self.browser.element_exists('[aria-label="Mark Reviewed"]'):
            self.browser.click('[aria-label="Mark Reviewed"]')
        else:
            self.browser.click('[aria-label="More issue actions"]')
            self.browser.wait_until('[data-test-id="mark-reviewed"]')
            self.browser.click('[data-test-id="mark-reviewed"]')

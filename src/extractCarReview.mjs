import puppeteer from 'puppeteer';

import { getBrowserConfig, getPageConfig, navigateWithRetry, convertHtmlToMarkdown } from './utils.mjs';

/**
 * Extracts car review from DRIVE2 car page
 * @param {string} url - URL of the car page
 * @returns {Promise<string>} - Markdown content of the car review
 */
export async function extractCarReview(url) {
  // Launch the browser
  const browser = await puppeteer.launch(getBrowserConfig());

  try {
    // Open a new page
    const page = await browser.newPage();

    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(getPageConfig().timeout);

    // Add headers to make requests more browser-like
    await page.setExtraHTTPHeaders(getPageConfig().headers);

    // Parse the base URL for constructing absolute URLs later
    const baseUrl = new URL(url).origin;

    // Navigate to the URL with retry logic
    await navigateWithRetry(page, url);

    // Extract the data we need
    const reviewData = await page.evaluate((baseUrlForPage) => {
      // Get the car title
      const title = document.querySelector('h1.x-title')?.textContent.trim() || 'Unknown Car';

      // Find the review section
      const reviewContent = document.querySelector('div[itemprop="reviewBody"]')?.innerHTML || '';

      // Get passport data
      const passportHeader = Array.from(document.querySelectorAll('.x-group-header'))
        .find(header => header.textContent.trim() === 'Паспортные данные');

      let passportContent = '';
      if (passportHeader) {
        const passportList = passportHeader.nextElementSibling;
        if (passportList && passportList.classList.contains('list-compact')) {
          passportContent = passportList.innerHTML;
        }
      }

      return { title, reviewContent, passportContent, baseUrl: baseUrlForPage };
    }, baseUrl);

    // Convert to Markdown format
    let markdown = `# ${reviewData.title}\n\n`;

    if (reviewData.reviewContent) {
      markdown += `## Отзыв владельца\n\n${convertHtmlToMarkdown(reviewData.reviewContent, reviewData.baseUrl)}\n\n`;
    } else {
      markdown += `## Отзыв владельца\n\nНе удалось найти отзыв владельца.\n\n`;
    }

    if (reviewData.passportContent) {
      markdown += `## Паспортные данные\n\n${convertHtmlToMarkdown(reviewData.passportContent, reviewData.baseUrl)}`;
    }

    return markdown;
  } finally {
    // Make sure to close the browser
    await browser.close();
  }
}

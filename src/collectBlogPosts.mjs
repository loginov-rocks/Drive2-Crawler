import puppeteer from 'puppeteer';

import { getBrowserConfig, getPageConfig, navigateWithRetry } from './utils.mjs';

/**
 * Get the number of pages for pagination
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<number>} - Number of pages
 */
async function getPageCount(page) {
  try {
    return await page.evaluate(() => {
      // Look for pagination links, if any
      const paginationLinks = document.querySelectorAll('a.c-page-link');
      if (paginationLinks.length === 0) return 1;

      // Get the last pagination link which should be the highest page number
      const pageNumbers = Array.from(paginationLinks)
        .map(link => parseInt(link.textContent.trim()))
        .filter(num => !isNaN(num));

      if (pageNumbers.length === 0) return 1;
      return Math.max(...pageNumbers);
    });
  } catch (error) {
    console.error('Error getting page count:', error.message);
    return 1; // Default to 1 page if we can't determine the count
  }
}

/**
 * Extract blog posts from a page
 * @param {Object} page - Puppeteer page object
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {Promise<Array>} - Array of blog posts
 */
async function extractPostsFromPage(page, baseUrl) {
  try {
    return await page.evaluate((baseUrlForPage) => {
      // Get the logbook container
      const logbookContainer = document.querySelector('.c-lb-list');
      if (!logbookContainer) return [];

      const posts = [];
      // Find all post cards
      const postCards = logbookContainer.querySelectorAll('.x-box.c-post-lcard');

      // Process each post card
      postCards.forEach(card => {
        const link = card.getAttribute('href');
        const absoluteLink = link && link.startsWith('/') ? `${baseUrlForPage}${link}` : link;

        const titleElement = card.querySelector('.c-post-lcard__caption');
        const title = titleElement ? titleElement.textContent.trim() : '';

        const categoryElement = card.querySelector('.u-text-overflow.x-secondary');
        const category = categoryElement ? categoryElement.textContent.trim() : '';

        const metaElements = card.querySelectorAll('.c-post-lcard__meta > div');
        const metadata = {};

        metaElements.forEach(element => {
          // Extract likes
          if (element.querySelector('.i-like-s')) {
            metadata.likes = element.textContent.trim();
          }
          // Extract comments
          else if (element.querySelector('.i-comments-s')) {
            metadata.comments = element.textContent.trim();
          }
          // Check if element has data-tt attribute
          else if (element.hasAttribute('data-tt')) {
            const tooltipText = element.getAttribute('data-tt');

            // Check if it's a date (contains month names or date format patterns)
            const isDate = /[а-я]+ \d{4}|^\d{1,2} [а-я]+ \d{4}/i.test(tooltipText);

            // Check if it's mileage (contains миль or км)
            const isMileage = /миль|км/i.test(tooltipText);

            if (isDate && !isMileage) {
              metadata.date = tooltipText;
            } else if (isMileage) {
              metadata.mileage = element.textContent.trim();
            }
          }
          // Extract price if present
          else if (element.textContent.includes('₽')) {
            metadata.price = element.textContent.trim();
          }
        });

        // Get image URL if available
        const imageElement = card.querySelector('img');
        const imageUrl = imageElement ? imageElement.getAttribute('src') : null;

        posts.push({
          title,
          link: absoluteLink,
          category,
          imageUrl,
          ...metadata
        });
      });

      return posts;
    }, baseUrl);
  } catch (error) {
    console.error('Error extracting posts:', error.message);
    return [];
  }
}

/**
 * Collects all blog posts from a car page
 * @param {string} url - URL of the car page
 * @returns {Promise<Array>} - Array of blog posts
 */
export async function collectBlogPosts(url) {
  // Launch the browser
  const browser = await puppeteer.launch(getBrowserConfig());

  try {
    // Open a new page
    const page = await browser.newPage();

    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(getPageConfig().timeout);

    // Add headers to make requests more browser-like
    await page.setExtraHTTPHeaders(getPageConfig().headers);

    // Parse the base URL for constructing absolute URLs
    const baseUrl = new URL(url).origin;

    // Navigate to the URL with retry logic
    await navigateWithRetry(page, url);

    // Check if pagination exists and determine how many pages there are
    const totalPages = await getPageCount(page);
    console.log(`Found ${totalPages} pages of blog posts`);

    let allPosts = [];

    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Add delay between page navigation to avoid rate limiting
      if (pageNum > 1) {
        console.log(`Navigating to page ${pageNum}/${totalPages}...`);

        // Wait a bit before loading the next page
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Navigate with retry logic
        try {
          await navigateWithRetry(page, `${url}?page=${pageNum}`);
        } catch (error) {
          console.error(`Failed to navigate to page ${pageNum}, skipping to next page`);
          continue;
        }
      }

      // Extract blog posts from the current page
      const postsOnPage = await extractPostsFromPage(page, baseUrl);

      allPosts = [...allPosts, ...postsOnPage];
      console.log(`Collected ${postsOnPage.length} posts from page ${pageNum}/${totalPages}`);
    }

    return allPosts;
  } finally {
    // Close the browser
    await browser.close();
  }
}

import puppeteer from 'puppeteer';

import { getBrowserConfig, getPageConfig, navigateWithRetry, convertHtmlToMarkdown } from './utils.mjs';

/**
 * Generate markdown for blog post
 * @param {Object} postData - Blog post data
 * @returns {string} - Markdown content
 */
function generateMarkdown(postData) {
  let markdown = `# ${postData.title}\n\n`;

  // Add publication date
  if (postData.publicationDate) {
    markdown += `*Published: ${postData.publicationDate}*\n\n`;
  }

  // Add author information
  markdown += `**Author:** [${postData.author.name}](${postData.baseUrl}${postData.author.url})\n`;

  if (postData.author.location) {
    markdown += `**Location:** ${postData.author.location}\n`;
  }

  if (postData.author.cars.length > 0) {
    markdown += `**Cars:** `;
    postData.author.cars.forEach((car, index) => {
      const carUrl = car.url.startsWith('/') ? `${postData.baseUrl}${car.url}` : car.url;

      if (index > 0) {
        markdown += `, `;
      }

      markdown += `[${car.name}](${carUrl})`;
    });
    markdown += `\n\n`;
  } else {
    markdown += `\n`;
  }

  // Add horizontal rule
  markdown += `---\n\n`;

  // Add metadata
  if (postData.metadata.cost || postData.metadata.mileage) {
    markdown += `## Metadata\n\n`;

    if (postData.metadata.cost) {
      markdown += `* ${postData.metadata.cost}\n`;
    }

    if (postData.metadata.mileage) {
      markdown += `* ${postData.metadata.mileage}\n`;
    }

    markdown += `\n`;
  }

  // Add main content
  markdown += `## Content\n\n`;
  markdown += convertHtmlToMarkdown(postData.contentHtml, postData.baseUrl);

  return markdown;
}

/**
 * Extracts content from a blog post
 * @param {string} url - URL of the blog post
 * @returns {Promise<string>} - Markdown content of the blog post
 */
export async function extractBlogPost(url) {
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
    const baseUrl = url.startsWith('http') ? new URL(url).origin : 'https://www.drive2.ru';

    // Navigate to the URL with retry logic
    await navigateWithRetry(page, url);

    // Extract the data we need
    const postData = await page.evaluate((baseUrlForPage) => {
      // Get the post title
      const title = document.querySelector('h1.x-title')?.textContent.trim() || 'Unknown Title';

      // Get publication date
      const dateElement = document.querySelector('.x-tertiary.x-secondary-color');
      const publicationDate = dateElement ? dateElement.textContent.trim() : '';

      // Get author information
      const authorElement = document.querySelector('.c-user-lcard');
      const authorName = authorElement?.querySelector('span[itemprop="name"]')?.textContent || 'Unknown Author';
      const authorUrl = authorElement?.querySelector('a[itemprop="url"]')?.getAttribute('href') || '';
      const authorLocation = authorElement?.querySelector('span[itemprop="address"]')?.getAttribute('title') || '';

      // Get author's car information
      const carInfoElements = authorElement?.querySelectorAll('.c-user-lcard__cars a') || [];
      const cars = Array.from(carInfoElements).map(car => ({
        name: car.textContent.trim(),
        url: car.getAttribute('href')
      }));

      // Get the main post content
      const contentElement = document.querySelector('div[itemprop="articleBody"]');
      const contentHtml = contentElement?.innerHTML || '';

      // Get post metadata (cost, mileage, etc.)
      const costElement = document.querySelector('.c-post__cost');
      const cost = costElement ? costElement.textContent.trim() : '';

      const mileageElement = document.querySelector('.c-post__mileage');
      const mileage = mileageElement ? mileageElement.textContent.trim() : '';

      // Get image information
      const imageElements = document.querySelectorAll('.c-post__pic');
      const images = Array.from(imageElements).map(imgElement => {
        const imgSrc = imgElement.querySelector('img')?.getAttribute('src') || '';
        const imgCaption = imgElement.querySelector('.c-post__desc')?.textContent.trim() || '';

        return {
          src: imgSrc,
          caption: imgCaption
        };
      });

      return {
        title,
        publicationDate,
        author: {
          name: authorName,
          url: authorUrl,
          location: authorLocation,
          cars
        },
        contentHtml,
        metadata: {
          cost,
          mileage
        },
        images,
        baseUrl: baseUrlForPage
      };
    }, baseUrl);

    // Convert to Markdown format
    const markdown = generateMarkdown(postData);

    return markdown;
  } finally {
    // Make sure to close the browser
    await browser.close();
  }
}

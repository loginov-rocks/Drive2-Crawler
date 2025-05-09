const fs = require('fs').promises;

/**
 * Creates a directory if it doesn't exist
 * @param {string} dirPath - Path to the directory
 */
async function createDirectoryIfNotExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Creates browser configuration for puppeteer
 * @returns {Object} - Puppeteer launch configuration
 */
function getBrowserConfig() {
  return {
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
}

/**
 * Gets common page configuration settings
 * @returns {Object} - Configuration for page setup
 */
function getPageConfig() {
  return {
    timeout: 120000, // 2 minutes
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0'
    },
    navigationOptions: {
      waitUntil: 'domcontentloaded',
      timeout: 90000 // 1.5 minutes
    }
  };
}

/**
 * Navigates to a URL with retry logic
 * @param {Object} page - Puppeteer page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @returns {Promise<boolean>} - Success status
 */
async function navigateWithRetry(page, url, options = {}) {
  const navigationOptions = {
    ...getPageConfig().navigationOptions,
    ...options
  };

  const maxRetries = options.maxRetries || 3;
  const retryDelay = options.retryDelay || 3000;

  let retries = maxRetries;
  let success = false;
  let lastError;

  while (retries > 0 && !success) {
    try {
      console.log(`Navigating to ${url} (${retries} attempts left)...`);
      await page.goto(url, navigationOptions);
      success = true;
    } catch (error) {
      lastError = error;
      console.log(`Navigation failed: ${error.message}. Retrying...`);
      retries--;
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  if (!success) {
    throw lastError || new Error('Failed to navigate to page after multiple attempts');
  }

  return success;
}

/**
 * Converts HTML to Markdown
 * @param {string} html - HTML content to convert
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {string} - Markdown content
 */
function convertHtmlToMarkdown(html, baseUrl) {
  // Handle figure elements with images and captions
  html = html.replace(/<figure class="c-post__pic[^"]*"[^>]*>[\s\S]*?(?:<img[^>]*src="([^"]*)"[^>]*>|<x-img[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>)[\s\S]*?<figcaption class="c-post__desc"[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/g,
    (match, src1, src2, caption) => {
      const imgSrc = src1 || src2; // Use whichever source was captured
      const captionText = caption.trim();
      return `\n\n![${captionText}](${imgSrc})\n\n*${captionText}*\n\n`;
    }
  );

  // Handle figure elements with images but WITHOUT captions
  html = html.replace(/<figure class="c-post__pic[^"]*"[^>]*>[\s\S]*?(?:<img[^>]*src="([^"]*)"[^>]*>|<x-img[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>)[\s\S]*?<\/figure>/g,
    (match, src1, src2, alt) => {
      const imgSrc = src1 || src2; // Use whichever source was captured
      const altText = alt ? alt.trim() : "Image";
      return `\n\n![${altText}](${imgSrc})\n\n`;
    }
  );

  return html
    // Handle paragraphs
    .replace(/<p>(.*?)<\/p>/gs, '$1\n\n')

    // Handle line breaks
    .replace(/<br\s*\/?>/g, '\n')

    // Handle formatting
    .replace(/<strong>(.*?)<\/strong>/gs, '**$1**')
    .replace(/<em>(.*?)<\/em>/gs, '*$1*')
    .replace(/<del>(.*?)<\/del>/gs, '~~$1~~')

    // Handle links - convert relative URLs to absolute
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs, (match, url, text) => {
      // Check if it's a relative URL and make it absolute
      if (url && !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('mailto:')) {
        // Handle URLs that start with / or without /
        if (url.startsWith('/')) {
          url = `${baseUrl}${url}`;
        } else {
          url = `${baseUrl}/${url}`;
        }
      }
      return `[${text}](${url})`;
    })

    // Handle lists
    .replace(/<li>(.*?)<\/li>/gs, '- $1\n')
    .replace(/<ul[^>]*>/g, '')
    .replace(/<\/ul>/g, '\n')

    // Remove other HTML tags
    .replace(/<[^>]*>/g, '')

    // Fix HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')

    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Creates a safe filename from a title
 * @param {string} title - Original title
 * @returns {string} - Safe filename
 */
function createSafeFilename(title) {
  return title.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

/**
 * Format date from various formats to YYYY-MM-DD
 * @param {string} dateStr - Date string in various formats
 * @returns {string} - Date in YYYY-MM-DD format or 'unknown-date' if invalid
 */
function formatDate(dateStr) {
  if (!dateStr) return 'unknown-date';

  // Try to parse ISO date format first (YYYY-MM-DDTHH:MM:SS+HH:MM)
  const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch && isoMatch[1]) {
    return isoMatch[1]; // Already in YYYY-MM-DD format
  }

  // Try DD.MM.YYYY format
  const dotMatch = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  }

  // Try to extract date from Russian format like "19 января 2014 в 15:18"
  const russianMonths = {
    'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
    'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
    'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12'
  };

  const russianMatch = dateStr.match(/(\d{1,2})\s+([а-яА-Я]+)\s+(\d{4})/);
  if (russianMatch) {
    const day = russianMatch[1].padStart(2, '0');
    const month = russianMonths[russianMatch[2].toLowerCase()];
    const year = russianMatch[3];

    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  return 'unknown-date';
}

module.exports = {
  createDirectoryIfNotExists,
  getBrowserConfig,
  getPageConfig,
  navigateWithRetry,
  convertHtmlToMarkdown,
  createSafeFilename,
  formatDate
};

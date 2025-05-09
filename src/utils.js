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
 * Format date from DD.MM.YYYY to YYYY-MM-DD
 * @param {string} dateStr - Date string in DD.MM.YYYY format
 * @returns {string} - Date in YYYY-MM-DD format or 'unknown-date' if invalid
 */
function formatDate(dateStr) {
  if (!dateStr) return 'unknown-date';
  
  const dateMatch = dateStr.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (dateMatch && dateMatch[1]) {
    const parts = dateMatch[1].split('.');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert DD.MM.YYYY to YYYY-MM-DD
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

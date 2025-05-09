const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function extractCarReview(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new" // Use new headless mode
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Navigate to the URL or use provided HTML content
    if (url.startsWith('http')) {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
    } else {
      await page.setContent(url, { waitUntil: 'networkidle0' });
    }
    
    // Extract the data we need
    const reviewData = await page.evaluate(() => {
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
      
      return { title, reviewContent, passportContent };
    });
    
    // Convert to Markdown format
    let markdown = `# ${reviewData.title}\n\n`;
    
    if (reviewData.reviewContent) {
      markdown += `## Отзыв владельца\n\n${convertHtmlToMarkdown(reviewData.reviewContent)}\n\n`;
    } else {
      markdown += `## Отзыв владельца\n\nНе удалось найти отзыв владельца.\n\n`;
    }
    
    if (reviewData.passportContent) {
      markdown += `## Паспортные данные\n\n${convertHtmlToMarkdown(reviewData.passportContent)}`;
    }
    
    return markdown;
  } finally {
    // Make sure to close the browser
    await browser.close();
  }
}

function convertHtmlToMarkdown(html) {
  return html
    // Handle paragraphs
    .replace(/<p>(.*?)<\/p>/gs, '$1\n\n')
    
    // Handle line breaks
    .replace(/<br\s*\/?>/g, '\n')
    
    // Handle formatting
    .replace(/<strong>(.*?)<\/strong>/gs, '**$1**')
    .replace(/<em>(.*?)<\/em>/gs, '*$1*')
    .replace(/<del>(.*?)<\/del>/gs, '~~$1~~')
    
    // Handle links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs, '[$2]($1)')
    
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

// Usage example
(async () => {
  // URL of the car page
  const carUrl = 'https://www.drive2.ru/r/toyota/chaser/288230376151952785/';
  
  try {
    // Extract the review
    const markdown = await extractCarReview(carUrl);
    
    // Save to file
    await fs.writeFile('toyota_chaser_review.md', markdown);
    console.log('Review successfully extracted and saved to toyota_chaser_review.md');
    
    // Print the result
    console.log(markdown);
  } catch (error) {
    console.error('Error extracting car review:', error);
  }
})();

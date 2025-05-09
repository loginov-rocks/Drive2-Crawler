const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function extractBlogPost(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new" // Use new headless mode
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Parse the base URL for constructing absolute URLs
    const baseUrl = url.startsWith('http') ? new URL(url).origin : 'https://www.drive2.ru';
    
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
    
    // Handle images from figures
    .replace(/<figure class="c-post__pic"[^>]*>.*?<img[^>]*src="([^"]*)".*?<figcaption[^>]*>(.*?)<\/figcaption>.*?<\/figure>/gs, 
      (match, src, caption) => {
        return `\n\n![${caption}](${src})\n*${caption}*\n\n`;
      })
    
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
async function extractAndSaveBlogPost(url, outputFile) {
  try {
    // Extract the blog post
    const markdown = await extractBlogPost(url);
    
    // Save to file
    await fs.writeFile(outputFile, markdown);
    console.log(`Blog post successfully extracted and saved to ${outputFile}`);
    
    return markdown;
  } catch (error) {
    console.error('Error extracting blog post:', error);
    throw error;
  }
}

// Usage
(async () => {
  // URL of the blog post page
  // This can be a URL or the HTML content as a string
  const blogPostUrl = 'https://www.drive2.ru/l/2790417/';
  
  try {
    // Extract and save the blog post
    const markdown = await extractAndSaveBlogPost(blogPostUrl, 'toyota_chaser_blog_post.md');
    
    // Print the result
    console.log('Extraction completed successfully!');
  } catch (error) {
    console.error('Error extracting blog post:', error);
  }
})();

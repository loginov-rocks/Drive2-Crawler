const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('input', {
    alias: 'i',
    description: 'URL to the DRIVE2 car page',
    type: 'string',
    demandOption: true
  })
  .option('output', {
    alias: 'o',
    description: 'Output directory for markdown files',
    type: 'string',
    demandOption: true
  })
  .help()
  .alias('help', 'h')
  .argv;

// Main function
async function main() {
  const carUrl = argv.input;
  const outputDir = argv.output;

  try {
    // Create output directory if it doesn't exist
    await createDirectoryIfNotExists(outputDir);
    console.log(`Output directory: ${outputDir}`);

    // Create a tracking file path to record progress
    const progressFilePath = path.join(outputDir, '.progress.json');
    let processedPosts = [];
    let reviewComplete = false;
    
    // Check if we have a progress file from previous run
    try {
      const progressData = await fs.readFile(progressFilePath, 'utf8');
      const progress = JSON.parse(progressData);
      processedPosts = progress.processedPosts || [];
      reviewComplete = progress.reviewComplete || false;
      console.log(`Resuming from previous progress. ${processedPosts.length} posts already processed.`);
    } catch (error) {
      // No progress file exists or invalid format, start fresh
      console.log('Starting fresh extraction...');
    }

    // Extract car review and save as Home.md if not done yet
    if (!reviewComplete) {
      console.log('Extracting car review...');
      try {
        const carReview = await extractCarReview(carUrl);
        await fs.writeFile(path.join(outputDir, 'Home.md'), carReview);
        console.log('Car review saved as Home.md');
        
        // Update progress
        await fs.writeFile(progressFilePath, JSON.stringify({
          reviewComplete: true,
          processedPosts: processedPosts
        }));
        reviewComplete = true;
      } catch (error) {
        console.error('Error extracting car review:', error.message);
        console.error('Will continue with blog posts collection...');
      }
    } else {
      console.log('Car review already extracted, skipping...');
    }

    // Collect all blog posts
    console.log('Collecting blog posts...');
    const blogPosts = await collectBlogPosts(carUrl);
    console.log(`Found ${blogPosts.length} blog posts`);

    // Filter out already processed posts
    const remainingPosts = blogPosts.filter(post => 
      !processedPosts.some(processedPost => processedPost.link === post.link)
    );
    console.log(`${remainingPosts.length} posts remaining to process`);

    // Extract and save each blog post
    console.log('Extracting blog posts content...');
    for (let i = 0; i < remainingPosts.length; i++) {
      const post = remainingPosts[i];
      console.log(`Processing post ${i+1}/${remainingPosts.length}: ${post.title}`);
      
      try {
        // Format the date for the filename
        let dateStr = 'unknown-date';
        if (post.date) {
          // Try to parse the date in the format found in the posts
          const dateMatch = post.date.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch && dateMatch[1]) {
            const parts = dateMatch[1].split('.');
            if (parts.length === 3) {
              dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert DD.MM.YYYY to YYYY-MM-DD
            }
          }
        }
        
        // Format the title for the filename (remove invalid characters)
        const safeTitle = post.title.replace(/[/\\?%*:|"<>]/g, '-').trim();
        const fileName = `${dateStr} - ${safeTitle}.md`;
        const filePath = path.join(outputDir, fileName);
        
        // Add some delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Extract and save the blog post
        const postContent = await extractBlogPost(post.link);
        await fs.writeFile(filePath, postContent);
        console.log(`Saved: ${fileName}`);
        
        // Update progress file after each successful post
        processedPosts.push({
          link: post.link,
          title: post.title,
          fileName: fileName
        });
        await fs.writeFile(progressFilePath, JSON.stringify({
          reviewComplete,
          processedPosts
        }));
      } catch (error) {
        console.error(`Error processing post: ${post.title}`, error.message);
        // Continue with the next post even if one fails
      }
    }

    console.log('All blog posts have been processed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Helper function to create directory if it doesn't exist
async function createDirectoryIfNotExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Better approach to handle pagination
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

// Extract car review function (based on extractCarReview.js)
async function extractCarReview(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new", // Use new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    
    // Add headers to make requests more browser-like
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0'
    });
    
    // Parse the base URL for constructing absolute URLs later
    const baseUrl = new URL(url).origin;
    
    // Navigate to the URL with retry logic
    let retries = 3;
    let success = false;
    let lastError;
    
    while (retries > 0 && !success) {
      try {
        console.log(`Navigating to ${url} (${retries} attempts left)...`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 90000
        });
        success = true;
      } catch (error) {
        lastError = error;
        console.log(`Navigation failed: ${error.message}. Retrying...`);
        retries--;
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    if (!success) {
      throw lastError || new Error('Failed to navigate to page after multiple attempts');
    }
    
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

// Collect blog posts function (based on collectBlogPosts.js)
async function collectBlogPosts(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    
    // Add headers to make requests more browser-like
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache'
    });
    
    // Parse the base URL for constructing absolute URLs
    const baseUrl = new URL(url).origin;
    
    // Navigate to the URL with retry logic
    let retries = 3;
    let success = false;
    
    while (retries > 0 && !success) {
      try {
        console.log(`Navigating to ${url} (${retries} attempts left)...`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 90000
        });
        success = true;
      } catch (error) {
        console.log(`Navigation failed: ${error.message}. Retrying...`);
        retries--;
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    if (!success) {
      throw new Error('Failed to navigate to the blog list page after multiple attempts');
    }
    
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
        let pageNavigationSuccess = false;
        let pageRetries = 3;
        
        while (!pageNavigationSuccess && pageRetries > 0) {
          try {
            await page.goto(`${url}?page=${pageNum}`, {
              waitUntil: 'domcontentloaded',
              timeout: 90000
            });
            pageNavigationSuccess = true;
          } catch (error) {
            console.error(`Error navigating to page ${pageNum}: ${error.message}`);
            pageRetries--;
            if (pageRetries > 0) {
              console.log(`Retrying... (${pageRetries} attempts left)`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }
        
        if (!pageNavigationSuccess) {
          console.error(`Failed to navigate to page ${pageNum}, skipping to next page`);
          continue;
        }
      }
      
      // Extract blog posts from the current page
      try {
        const postsOnPage = await page.evaluate((baseUrlForPage) => {
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
              // Extract date
              else if (element.hasAttribute('data-tt')) {
                metadata.date = element.getAttribute('data-tt');
              }
              // Extract price if present
              else if (element.textContent.includes('₽')) {
                metadata.price = element.textContent.trim();
              }
              // Extract mileage if present
              else if (element.hasAttribute('title') && element.getAttribute('title').includes('миля') || 
                      element.getAttribute('title')?.includes('км')) {
                metadata.mileage = element.textContent.trim();
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
        
        allPosts = [...allPosts, ...postsOnPage];
        console.log(`Collected ${postsOnPage.length} posts from page ${pageNum}/${totalPages}`);
      } catch (error) {
        console.error(`Error extracting posts from page ${pageNum}: ${error.message}`);
        console.error('Continuing with the next page...');
      }
    }
    
    return allPosts;
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Extract blog post function (based on extractBlogPost.js)
async function extractBlogPost(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new", // Use new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Set a longer timeout for navigation
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    
    // Add headers to make requests more browser-like
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'max-age=0'
    });
    
    // Parse the base URL for constructing absolute URLs
    const baseUrl = url.startsWith('http') ? new URL(url).origin : 'https://www.drive2.ru';
    
    // Navigate to the URL with retry logic
    let retries = 3;
    let success = false;
    let lastError;
    
    while (retries > 0 && !success) {
      try {
        console.log(`Navigating to ${url} (${retries} attempts left)...`);
        await page.goto(url, {
          waitUntil: 'domcontentloaded', // Try with a less strict wait condition
          timeout: 90000 // 1.5 minutes
        });
        success = true;
      } catch (error) {
        lastError = error;
        console.log(`Navigation failed: ${error.message}. Retrying...`);
        retries--;
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    if (!success) {
      throw lastError || new Error('Failed to navigate to page after multiple attempts');
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

// HTML to Markdown conversion helper (for car review)
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

// Generate markdown for blog post
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

// Run the main function
main().catch(console.error);

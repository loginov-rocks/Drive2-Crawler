const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function collectBlogPosts(url) {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new"
  });
  
  try {
    // Open a new page
    const page = await browser.newPage();
    
    // Parse the base URL for constructing absolute URLs
    const baseUrl = new URL(url).origin;
    
    // Navigate to the URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Check if pagination exists and determine how many pages there are
    const totalPages = await page.evaluate(() => {
      // Look for pagination links, if any
      const paginationLinks = document.querySelectorAll('a.c-page-link');
      if (paginationLinks.length === 0) return 1;
      
      // Get the last pagination link which should be the highest page number
      const lastPageLink = Array.from(paginationLinks).pop();
      const lastPageNumber = parseInt(lastPageLink.textContent.trim());
      return isNaN(lastPageNumber) ? 1 : lastPageNumber;
    });
    
    let allPosts = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (pageNum > 1) {
        await page.goto(`${url}?page=${pageNum}`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
      }
      
      // Extract blog posts from the current page
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
    }
    
    return allPosts;
  } finally {
    // Close the browser
    await browser.close();
  }
}

async function savePostsToMarkdown(posts, outputFile) {
  let markdown = `# Car Blog Posts\n\n`;
  
  // Group posts by category
  const postsByCategory = {};
  posts.forEach(post => {
    if (!postsByCategory[post.category]) {
      postsByCategory[post.category] = [];
    }
    postsByCategory[post.category].push(post);
  });
  
  // Generate markdown for each category
  for (const [category, categoryPosts] of Object.entries(postsByCategory)) {
    markdown += `## ${category}\n\n`;
    
    categoryPosts.forEach(post => {
      markdown += `### [${post.title}](${post.link})\n\n`;
      
      if (post.date) {
        markdown += `**Date:** ${post.date}\n\n`;
      }
      
      if (post.likes) {
        markdown += `👍 ${post.likes} `;
      }
      
      if (post.comments) {
        markdown += `💬 ${post.comments} `;
      }
      
      if (post.price) {
        markdown += `💰 ${post.price} `;
      }
      
      if (post.mileage) {
        markdown += `🚗 ${post.mileage}`;
      }
      
      markdown += `\n\n`;
      
      if (post.imageUrl) {
        markdown += `![Image](${post.imageUrl})\n\n`;
      }
      
      markdown += `---\n\n`;
    });
  }
  
  await fs.writeFile(outputFile, markdown);
}

async function savePostsToJson(posts, outputFile) {
  await fs.writeFile(outputFile, JSON.stringify(posts, null, 2));
}

// Usage example
(async () => {
  // URL of the car page
  const carUrl = 'https://www.drive2.ru/r/toyota/chaser/288230376151952785/';
  
  try {
    // Collect blog posts
    console.log('Collecting blog posts...');
    const posts = await collectBlogPosts(carUrl);
    console.log(`Found ${posts.length} blog posts.`);
    
    // Save to markdown file
    const markdownFile = 'toyota_chaser_blog_posts.md';
    await savePostsToMarkdown(posts, markdownFile);
    console.log(`Saved markdown to ${markdownFile}`);
    
    // Save to JSON file (for easier programmatic access)
    const jsonFile = 'toyota_chaser_blog_posts.json';
    await savePostsToJson(posts, jsonFile);
    console.log(`Saved JSON data to ${jsonFile}`);
    
  } catch (error) {
    console.error('Error collecting blog posts:', error);
  }
})();

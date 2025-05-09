const puppeteer = require('puppeteer');
const fs = require('fs');

async function saveWebPage(url, outputPath) {
  // Launch the browser
  const browser = await puppeteer.launch();
  
  // Open a new page
  const page = await browser.newPage();
  
  // Navigate to the URL
  await page.goto(url, { waitUntil: 'networkidle2' });
  
  // Get the HTML content
  const html = await page.content();
  
  // Save the HTML to a file
  fs.writeFileSync(outputPath, html);
  
  // Close the browser
  await browser.close();
  
  console.log(`Page saved to ${outputPath}`);
}

// Usage
saveWebPage('https://www.drive2.ru/r/toyota/chaser/288230376151952785/', 'example.html');

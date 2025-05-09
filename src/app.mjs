import { promises as fs } from 'fs';
import path from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

// Import modules
import { extractCarReview } from './extractCarReview.mjs';
import { collectBlogPosts } from './collectBlogPosts.mjs';
import { extractBlogPost } from './extractBlogPost.mjs';
import { ProgressTracker } from './progressTracker.mjs';
import { createDirectoryIfNotExists, formatDate, createSafeFilename } from './utils.mjs';

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

    // Initialize progress tracker
    const progress = new ProgressTracker(outputDir);
    await progress.load();

    if (progress.getProcessedCount() > 0) {
      console.log(`Resuming from previous progress. ${progress.getProcessedCount()} posts already processed.`);
    } else {
      console.log('Starting fresh extraction...');
    }

    // Extract car review and save as Home.md if not done yet
    if (!progress.isReviewComplete()) {
      console.log('Extracting car review...');
      try {
        const carReview = await extractCarReview(carUrl);
        await fs.writeFile(path.join(outputDir, 'Home.md'), carReview);
        console.log('Car review saved as Home.md');

        // Update progress
        await progress.markReviewComplete();
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
    const remainingPosts = progress.filterRemainingPosts(blogPosts);
    console.log(`${remainingPosts.length} posts remaining to process`);

    // Extract and save each blog post
    console.log('Extracting blog posts content...');
    for (let i = 0; i < remainingPosts.length; i++) {
      const post = remainingPosts[i];
      console.log(`Processing post ${i + 1}/${remainingPosts.length}: ${post.title}`);

      try {
        // Format the date for the filename
        const dateStr = formatDate(post.date);

        // Format the title for the filename (remove invalid characters)
        const safeTitle = createSafeFilename(post.title);
        const fileName = `${dateStr} - ${safeTitle}.md`;
        const filePath = path.join(outputDir, fileName);

        // Add some delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract and save the blog post
        const postContent = await extractBlogPost(post.link);
        await fs.writeFile(filePath, postContent);
        console.log(`Saved: ${fileName}`);

        // Update progress file after each successful post
        await progress.markPostProcessed(post, fileName);
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

// Run the main function
main().catch(console.error);

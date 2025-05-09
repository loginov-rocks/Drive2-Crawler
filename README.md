# DRIVE2 Scraper

A Node.js application that scrapes car reviews and blog posts from DRIVE2 website and saves them as markdown files.

## Features

- Extracts car review information from a DRIVE2 car page
- Collects all blog posts for a specific car
- Extracts each blog post content
- Saves all content as markdown files in a specified directory
- Handles pagination when collecting blog posts
- Formats filenames with dates (YYYY-MM-DD)
- Supports resuming interrupted extractions

## Installation

1. Clone this repository or download the files
2. Install dependencies:

```bash
npm install
```

3. (Optional) Make it globally available:

```bash
npm link
```

## Usage

Run the application with the following command:

```bash
node drive2Scraper.js --input <DRIVE2_URL> --output <OUTPUT_DIRECTORY>
```

Or if installed globally:

```bash
drive2-scraper --input <DRIVE2_URL> --output <OUTPUT_DIRECTORY>
```

Example:

```bash
node drive2Scraper.js --input https://www.drive2.ru/r/toyota/chaser/288230376151952785/ --output ./toyota_chaser
```

### Arguments

- `--input` or `-i`: URL to the DRIVE2 car page (required)
- `--output` or `-o`: Output directory for markdown files (required)
- `--help` or `-h`: Show help information

## Output

The application creates the following files:

- `Home.md` - Contains the main car review
- Multiple blog post markdown files with the format: `YYYY-MM-DD - Blog Title.md`
- `.progress.json` - Used to track progress (hidden file)

## Project Structure

The project is organized in a modular way for better maintainability:

- `drive2Scraper.js` - Main script and entry point
- `extractCarReview.js` - Module for extracting car reviews
- `collectBlogPosts.js` - Module for collecting blog post links
- `extractBlogPost.js` - Module for extracting individual blog posts
- `progressTracker.js` - Module for tracking extraction progress
- `utils.js` - Utility functions used by other modules

## Technical Details

This application is built with:

- Node.js
- Puppeteer for web scraping
- Yargs for command-line argument parsing

## Notes

- The application handles Russian text and Cyrillic characters
- Invalid characters in filenames are automatically replaced with hyphens
- If a date cannot be parsed from a blog post, "unknown-date" is used in the filename
- The application will continue processing other blog posts if one fails
- Automatic progress tracking allows resuming the scraping process if interrupted

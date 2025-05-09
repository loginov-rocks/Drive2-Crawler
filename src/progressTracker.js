const fs = require('fs').promises;
const path = require('path');

/**
 * Class to track progress of the extraction process
 */
class ProgressTracker {
  /**
   * Create a progress tracker
   * @param {string} outputDir - Directory where files will be saved
   */
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.filePath = path.join(outputDir, '.progress.json');
    this.data = {
      reviewComplete: false,
      processedPosts: []
    };
    this.loaded = false;
  }
  
  /**
   * Load progress data from file
   * @returns {Promise<boolean>} - True if progress data was loaded
   */
  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const progress = JSON.parse(data);
      this.data.reviewComplete = progress.reviewComplete || false;
      this.data.processedPosts = progress.processedPosts || [];
      this.loaded = true;
      return true;
    } catch (error) {
      // No progress file exists or invalid format
      this.loaded = true;
      return false;
    }
  }
  
  /**
   * Save progress data to file
   * @returns {Promise<void>}
   */
  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }
  
  /**
   * Check if review has been completed
   * @returns {boolean}
   */
  isReviewComplete() {
    return this.data.reviewComplete;
  }
  
  /**
   * Mark review as complete
   * @returns {Promise<void>}
   */
  async markReviewComplete() {
    this.data.reviewComplete = true;
    await this.save();
  }
  
  /**
   * Check if a post has been processed
   * @param {Object} post - Post to check
   * @returns {boolean}
   */
  isPostProcessed(post) {
    return this.data.processedPosts.some(p => p.link === post.link);
  }
  
  /**
   * Mark a post as processed
   * @param {Object} post - Post that was processed
   * @param {string} fileName - Filename where post was saved
   * @returns {Promise<void>}
   */
  async markPostProcessed(post, fileName) {
    this.data.processedPosts.push({
      link: post.link,
      title: post.title,
      fileName: fileName
    });
    await this.save();
  }
  
  /**
   * Get number of processed posts
   * @returns {number}
   */
  getProcessedCount() {
    return this.data.processedPosts.length;
  }
  
  /**
   * Filter posts to get only unprocessed ones
   * @param {Array} posts - All posts
   * @returns {Array} - Unprocessed posts
   */
  filterRemainingPosts(posts) {
    return posts.filter(post => !this.isPostProcessed(post));
  }
}

module.exports = ProgressTracker;

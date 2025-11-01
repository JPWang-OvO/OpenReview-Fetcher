# OpenReview Fetcher for Zotero

A Zotero plugin that automatically fetches and organizes OpenReview comments, reviews, and discussions for academic papers.

## Features

- **Automatic Detection**: Automatically detects OpenReview papers in your Zotero library
- **Review Extraction**: Fetches peer reviews, author responses, and discussion comments
- **Multiple Save Formats**: Save as HTML notes or Markdown attachments
- **Statistics Integration**: Optional inclusion of review statistics and metrics
- **Batch Processing**: Process multiple papers at once
- **Configurable Settings**: Customize API endpoints, timeouts, and retry behavior

## Installation

### From Release (Recommended)

1. Download the latest `.xpi` file from the [Releases](../../releases) page
2. In Zotero, go to `Tools` → `Add-ons`
3. Click the gear icon and select `Install Add-on From File...`
4. Select the downloaded `.xpi` file
5. Restart Zotero

### From Source

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Install the generated `.xpi` file in Zotero

## Usage

### Basic Usage

0. Items must have effective OpenReview URLs in their URL field
1. Select one or more such items in your Zotero library
2. Right-click and select `Fetch OpenReview Comments`
3. The plugin will automatically detect OpenReview papers and fetch their reviews
4. Reviews will be saved according to your preferences (HTML notes or Markdown attachments)

### Toolbar Button

You can also use the OpenReview toolbar button in the Zotero interface for quick access.

### Settings

Access plugin settings through `Edit` → `Preferences` → `OpenReview Fetcher`:

- **Save Mode**: Choose between HTML notes or Markdown attachments
- **Include Statistics**: Toggle inclusion of review statistics
- **API Base URL**: Configure the OpenReview API endpoint (default: https://api.openreview.net), which should not be changed unless you have a specific reason to do so.
- **Max Retries**: Set maximum retry attempts for failed requests
- **Request Timeout**: Configure request timeout in milliseconds

## Supported Paper Sources

The plugin can extract OpenReview data from papers with:
- OpenReview URLs in the URL field
- DOIs that correspond to OpenReview papers

## Output Formats

### HTML Notes
Reviews are saved as HTML notes attached to the Zotero item, including:
- Reviewer information and ratings
- Review text with formatting
- Author responses
- Discussion threads
- Review statistics (if enabled)

### Markdown Attachments (Recommended)
Reviews are saved as Markdown files attached to the Zotero item. OpenReview API returns Markdown-formatted text, which is rendered as-is in many Markdown viewers. Therefore, markdown attachments are more recommended.

## Development

### Prerequisites

- Node.js 16+
- npm or yarn
- Zotero (for testing)

### Setup

```bash
# Clone the repository
git clone https://github.com/JPWang-OvO/OpenReview-Comments-Fetcher.git
cd openreview-zotero-plugin

# Install dependencies
npm install

# Start development server with hot reload
npm start

# Build for production
npm run build

# Run tests
npm test
```

### Project Structure

```
src/
├── addon.ts              # Main addon class
├── hooks.ts              # Zotero lifecycle hooks
├── index.ts              # Plugin entry point
├── modules/
│   ├── openreview.ts     # OpenReview API client
│   ├── openreview-ui.ts  # UI integration
│   ├── data-processor.ts # Data processing utilities
│   └── error-handler.ts  # Error handling
└── utils/                # Utility functions
```

## API Reference

The plugin uses the OpenReview API v2. For more information about the API, visit:
- [OpenReview API Documentation](https://docs.openreview.net/reference/api-v2)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Commit your changes: `git commit -am 'Add feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)
- Uses [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- OpenReview API provided by [OpenReview.net](https://openreview.net)

## Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page for existing problems
2. Create a new issue with detailed information about your problem
3. Include your Zotero version and plugin version in bug reports

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.

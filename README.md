# Strapi HTTP Transfer (Strapi Sync)

A command-line tool for synchronizing and transferring data between Strapi instances via HTTP. This tool enables seamless migration of content, media files, and schemas across different Strapi environments.

## 🚀 Features

- **Instance Management**: Save and manage multiple Strapi instance configurations
- **Complete Data Transfer**: Transfer all data including:
  - Media Center files and assets
  - Content Manager data
  - Content type schemas
- **Automated Cleanup**: Optionally clear target instance data before transfer
- **Authentication**: Secure JWT-based authentication
- **Interactive CLI**: User-friendly command-line interface with guided prompts
- **Cross-Instance Sync**: Easily sync between development, staging, and production environments

## 📋 Prerequisites

- [Deno](https://deno.land/) runtime installed
- Access to source and target Strapi instances
- Valid admin credentials for both Strapi instances

## 🔧 Installation

Clone the repository:

```bash
git clone <repository-url>
cd strapi-http-transfer
```

No additional dependencies installation needed - Deno handles everything!

## 🎯 Usage

### Start the Application

```bash
deno task start
```

Or for development with auto-reload:

```bash
deno task dev
```

### Main Menu Options

When you run the application, you'll see two main options:

#### 1. Manage Saved Instances

Configure and manage your Strapi instances:

- **Add an instance**: Save a new Strapi instance with credentials
  - Instance name (identifier)
  - URL (e.g., `https://your-strapi-instance.com`)
  - Email (admin user)
  - Password

- **Remove an instance**: Delete a saved instance configuration

- **List instances**: View all saved instances

#### 2. Transfer Data

Synchronize data between two Strapi instances:

1. Select source instance (where data comes from)
2. Select target instance (where data goes to)
3. The tool will:
   - Authenticate to both instances
   - Download media files and content from source
   - Clear existing data from target (if needed)
   - Upload media files to target
   - Upload content data to target
   - Map relationships between content

## 📁 Project Structure

```
src/
├── authentication/       # JWT authentication and schema retrieval
├── content-manager/      # Content data operations (upload/download/delete)
├── media-center/         # Media file operations (upload/download/clear)
├── instances-manager/    # Instance configuration management
├── operations/           # Main CLI operations
│   ├── manage-instances/ # Instance management operations
│   └── transfer/         # Data transfer operations
└── utils/                # Utility functions (prompts, choices)
```

## 💾 Data Storage

Instance configurations are stored in your home directory:
- Location: `~/strapi-sync-instances.json`
- Format: JSON with instance name, URL, email, and password

## ⚠️ Important Notes

- **Credentials Security**: Instance credentials are stored in plain text in your home directory. Ensure proper file permissions and consider using environment variables for sensitive deployments.

- **Data Overwrite**: The transfer operation clears existing data in the target instance before uploading. Always backup your target instance before transfer.

- **Large Transfers**: For instances with many media files or content entries, the transfer process may take considerable time.

- **Schema Compatibility**: Ensure source and target instances have compatible Strapi versions and plugin configurations.

## 🛠️ Configuration

The application uses environment variables for certain operations. Create a `.env` file in the project root if needed:

```env
# Add any required environment variables here
```

## 📝 License

[Add your license information here]

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Troubleshooting

### Authentication Issues
- Verify admin credentials are correct
- Ensure the Strapi instance is accessible
- Check that JWT authentication is enabled in Strapi

### Transfer Failures
- Check network connectivity
- Verify sufficient disk space for media files
- Ensure target instance has same content types as source

### Permission Errors
- Confirm admin user has necessary permissions
- Check file system permissions for `~/strapi-sync-instances.json`

## 📚 Technical Details

- **Runtime**: Deno
- **Language**: TypeScript
- **Architecture**: Modular operation-based design
- **Storage**: Local JSON file for instance configs
- **Transfer Method**: HTTP/REST API
- **Assets**: Temporary storage in `assets/` directory during transfer

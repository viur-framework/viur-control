let settingsStorageSchema = {
  "title": "settingsStorageSchema",
  "type": ["object"],
  "properties": {
    "projects_directory": {
      "type": "string",
    },
    "gcloud_tool_path": {
      "type": "string",
    },
    "label_icon_repository": {
      "type": "string",
    },
    "version_developer_sign": {
      "type": "string",
    },
    "terminal_background_color": {
      "type": "string",
    },
    "terminal_foreground_color": {
      "type": "string",
    }
  }
};

module.exports["settingsStorageSchema"] = settingsStorageSchema;

let projectStorageSchema = {
  "title": "projectsSchema",
  "type": "object",
  "required": [
    "projects",
    "project_storage_version"
  ],
  "properties": {
    "project_storage_version": {
      "type": "integer"
    },
    "projects": {
      "type": ["null", "array"],
      "items": {
        "type": "object",
        "properties": {
          "absolutePath": {
            "type": "string",
          },
          "adminPort": {
            "type": "integer",
          },
          "appengineDirectories": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "value": {
                  "type": "string",
                },
                "checked": {
                  "type": "boolean",
                }
              }
            }
          },
          "applicationIds": {
            "type": ["null", "array"],
            "items": {
              "type": "object",
              "properties": {
                "value": {
                  "type": "string",
                },
                "checked": {
                  "type": "boolean",
                }
              },
              "required": ["value", "checked"]
            }
          },
          "credentials": {
            "type": ["null", "array"],
            "items": {
              "type": "object",
              "properties": {
                "applicationId": {
                  "type": "string",
                },
                "username": {
                  "type": "string",
                },
                "password": {
                  "type": "string",
                }
              }
            }
          },
          "directoryName": {
            "type": "string",
          },
          "internalId": {
            "type": "string",
          },
          "serverPort": {
            "type": "integer",
          },
          "custom_devserver_cmd": {
            "type": ["null", "string"]
          },
          "tasks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                },
                "id": {
                  "type": "string",
                },
                "cmd": {
                  "type": "string",
                },
                "directory": {
                  "type": "string",
                },
                "pane": {
                  "enum": ["development", "deployment"]
                },
                "shell": {
                  "type": "boolean",
                },
                "requiredForDeployment": {
                  "type": "boolean",
                },
                "checking": {
                  "type": ["null", "array"],
                  "items": {
                    "type": "array",
                    "items": [
                      {
                        "type": "string"
                      }, {
                        "type": "string"
                      }
                    ]
                  },
                  "uniqueItems": true
                },
                "taskArguments": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "label": {
                        "type": "string"
                      },
                      "name": {
                        "type": "string"
                      },
                      "selectType": {
                        "type": "boolean"
                      },
                      "argumentOptions": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "title": {
                              "type": "string"
                            },
                            "value": {
                              "type": "string"
                            },
                            "flags": {
                              "type": ["null", "array"],
                              "items": {"type": "string"},
                              "uniqueItems": true
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};


module.exports["projectStorageSchema"] = projectStorageSchema;

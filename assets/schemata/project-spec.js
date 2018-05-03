let projectSpecSchema = {
  "title": "projectSpecSchema",
  "type": "object",
  "properties": {
    "projectIcon": {
      "type": ["null", "object"],
      "properties": {
        "url": {
          "type": "string"
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
            },
          }
        }
      }
    }
  }
};

module.exports["projectSpecSchema"] = projectSpecSchema;

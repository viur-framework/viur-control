let credentialsSchema = {
  "title": "viurCredentialsSchema",
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
};

module.exports["credentialsSchema"] = credentialsSchema;

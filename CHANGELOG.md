# Change log

## [Unreleased] - 2024-03-29

### Important
* Interrupting a streaming message will now add the partial message to the conversation
* User messages are immediately added to the conversation upon being committed, so will be saved even if the request fails or the response is interrupted
* !rw command now supports optional branch index in addition to message index
* !pr and !cp commands now support printing/copying by index / branch index, and default behavior is to print last message text
* !edit also supports optional index/branch index to edit a specific message

### Other

* Moved conversation parsing to separate module
* Added support for xml conversation transcript format
* Added tests for parsing and type conversion 
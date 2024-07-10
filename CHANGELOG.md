# Change log

## 2024-7-9
* track and indicate visited status of messages

## 2024-7-3
* Settings now automatically update when the settings file is changed without requiring a restart

## 2024-6-4

### Impacts UX
* Example settings updated
* Bing
    * Updated cookie
    * Added support for parallel completions
    * updated injection technique, MSFT completely defeated
    * updated names/functionality of some settings
* Made parallel streaming messages non-blocking 
* User suggestions display if available for current message, not just the most recently generated message
* User suggestions added to autocomplete menu
* Lastconversation autosave state updates whenever navigation occurs


### Other
* Refactored ChatClient interface
* Refactored BingAIClient interface to be consistent with ChatClient

## 2024-5-31

### Impacts UX
* Anthropic API n param now working from settings
* If messages are interrupted or there is an error, all partially streamed messages are now saved
* Fixed bug where Anthropic API doesn't work if system prompt is empty/null

## 2024-05-07

### Impacts UX
* Updated Bing cookie, Sydney access restored
* added chatGPT client (openAI chat API)
* added parallel completions for Claude
* consecutive messages from the user or assistant are now automatically merged by the client, and don't need to be manually merged by the user
* display system message at top of conversations

### Other
* refactored ChatClient classes

## 2024-03-29

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
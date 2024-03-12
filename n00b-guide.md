# CLooI n00b guide

**Tip:** I highly recommend asking a language model to help with the installation if you run into any difficulties. You can paste this whole guide into the conversation as context.

## overview

To use the CLooI (aka the BCLI), you need:
- To have [git installed](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- To have a github account, with [authentication set up](https://docs.github.com/en/enterprise-server@3.4/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- To have [Node.js and npm installed](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- To clone the files of this project onto your computer using `git clone https://github.com/socketteer/bingleton-api`
- To install the dependencies of the project using the `npm install` command
- To rename the `settings.example.js` file to `settings.js`
- To run the CLooI using `npm run cli`

## detailed step-by-step

(same as overview, but in more detail)

### 1 cloning the repo

in a command line, navigate to a directory where you want these files to live and run
```
git clone https://github.com/socketteer/bingleton-api
```
This will create a folder called `bingleton-api`

 - If you get an error saying git is not installed or command git not found, [install git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) first
 - If it says you do not have permissions, you probably have to [set up a personal access token](https://docs.github.com/en/enterprise-server@3.4/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### 2 installing dependencies

Inside the `bingleton-api` folder, run `npm install`. This will install all the rest of the dependencies that the code uses.

- if you get an error saying npm is not installed/found, [install Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) first.

### 3 setting up settings

Rename `settings.example.js` (a file in `bingleton-api`) to `settings.js` in the root directory. When you pull updates in the future, you may need to do this step again.

### 4 setting API keys

For Claude, you will have to set your Anthropic API key as an environmental variable. To do this, run
```
export ANTHROPIC_API_KEY=<your anthropic api key>
```
in the `bingleton-api` folder.

For infrastructs using OpenAI base models, you will have to set `OPENAI_API_KEY` in the same way.

### 5 running the BCLI

To start the Bingleton Command Loom interface, simply run the command
```
npm run cli
```
in the `bingleton-api` folder.

See [README.md](./README.md) (the document at the bottom of https://github.com/socketteer/bingleton-api, also one of the files in the `bingleton-api` folder that you cloned) for documentation about commands and settings.
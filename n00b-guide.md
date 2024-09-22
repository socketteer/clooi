# CLooI n00b guide

**Installation guide written for people without coding experience.**

**Tip:** I highly recommend asking a language model to help with the installation if you run into any difficulties. You can paste this whole guide into the conversation as context.

## overview

To use the CLooI (aka the BCLI), you need to:
- have [git installed](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- have [Node.js and npm installed](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- clone the files of this project onto your computer using `git clone https://github.com/socketteer/clooi.git`
- install the dependencies of the project using the `npm install` command
- rename the `settings.example.js` file to `settings.js`
- Set API key(s) as environmental variables
- launch the CLooI using `npm run cli`

## detailed step-by-step

(same as overview, but in more detail)

### 1 cloning the repo

in a command line, navigate to a directory where you want these files to live and run
```
git clone git@github.com:socketteer/clooi.git
```
This will create a folder called `clooi`

 - If you get an error saying git is not installed or command git not found, [install git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) first
 - If it says you do not have permissions, you probably have to [set up a personal access token](https://docs.github.com/en/enterprise-server@3.4/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

### 2 installing dependencies

Inside the `clooi` folder, run `npm install`. This will install all the rest of the dependencies that the code uses.

- if you get an error saying npm is not installed/found, [install Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) first.

### 3 setting up settings

Rename `settings.example.js` (a file in `clooi`) to `settings.js` in the root directory. When you pull updates in the future, you may need to do this step again.

### 4 setting API keys

For Claude, you will have to set your Anthropic API key as an environmental variable. To do this, run
```
export ANTHROPIC_API_KEY=<your anthropic api key>
```
in the `clooi` folder.

For infrastructs using OpenAI base models, you will have to set `OPENAI_API_KEY` in the same way.

### 5 running the BCLI

To start the Bingleton Command Loom interface, simply run the command
```
npm run cli
```
in the `clooi` folder.

See [README.md](./README.md) (also one of the files in the `clooi` folder that you cloned) for documentation about commands and settings.

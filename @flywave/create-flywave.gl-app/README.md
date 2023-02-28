# Harp.gl application creator

Application creator for [flywave.gl](https://github.com/heremaps/flywave.gl) based projects.

## Pre-requirements

* [node.js](https://nodejs.org/)
* By default, generated app retrieves map data from HERE Vector Tiles Service. You need an `apikey` that you can generate yourself. Please see our [Getting Started Guide](../../docs/GettingStartedGuide.md).

## Usage

```sh
npm init @flywave/flywave.gl-app
```
This command will generate a complete flywave.gl project based on Node.js, Webpack, and Typescript.
You will be prompted to specify an example directory, package name, and access token.

To start:

```sh
cd flywave.gl-example && npm start
```

Open `http://localhost:8080/` in your browser to see the running application.

## Generator Development & Testing

Testing locally:

```sh
yarn create-harpgl-app
```
or:
```sh
mkdir /tmp/clean && cd /tmp/clean
npm install /path/to/@flywave/create-flywave.gl-app
npm init @flywave/harpgl-app
```

const CopyWebpackPlugin = require("copy-webpack-plugin");
const { addHarpWebpackConfig } = require("@flywave/flywave-webpack-utils/scripts/HarpWebpackConfig"); 

const NPM_TARGET = process.env.npm_lifecycle_event; // eslint-disable-line no-process-env

const targetIsRun = NPM_TARGET === "build";
const DEV = !targetIsRun;

var webpack = require("webpack")
const plugins = [
  new webpack.DefinePlugin({
    'process.env': {}
  }),
  new CopyWebpackPlugin({
    patterns: [
      require.resolve("three/build/three.js"), 
      {
        from: "src/loaders/libs",
        to: "libs/",
        toType: "dir"
      }
    ]
  })
];

var exports = addHarpWebpackConfig({
  output: {
    filename: "[name].bundle.js",
    library: "FlywaveGl"
  },
  optimization: {
    minimize: !DEV
  },
  devServer: {
    hot: false,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" },
    proxy: {
      "/api": "http://localhost:8066"
    },
    port: 8000,
  },
  module: {
    rules: [
      {
        test: /\.(js)?$/,
        // exclude: STANDARD_EXCLUDE,
        use: {
          loader: "babel-loader",
          options: { cacheDirectory: true },
        },
      }, {
        test: /\.(js)?$/,
        // exclude: STANDARD_EXCLUDE,
        use: {
          loader: "remove-flow-types-loader",
          options: { cacheDirectory: true },
        },
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
          }
        ]
      }, {
        test: /\.(svg)$/,
        use: [
          { loader: "raw-loader", options: {} },
        ],
      },
      {
        test: /\.(png|jpg|gif)$/,
        use: [
          {
            loader: 'url-loader',
          }
        ]
      }
    ]
  },
  plugins
}, { mainEntry: (DEV && NPM_TARGET != "debug") ? "./src/dev-index.js" : "./src/index.js", decoderEntry: "./src/decoder.js", htmlTemplate: DEV ? "./index.html" : undefined });

exports[0].name="main"
exports.forEach(config => {
  config.devtool = DEV ? "source-map" : undefined;
});

module.exports = exports;

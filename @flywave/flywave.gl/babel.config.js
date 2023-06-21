const config = {
    presets: [ 
        ['@babel/preset-flow'],
    ],
    plugins: [
        '@babel/syntax-dynamic-import', '@babel/plugin-proposal-class-properties'
    ]
};

// Jest needs module transformation
config.env = {
    test: {
        presets: config.presets,
        plugins: config.plugins,
    },
};

module.exports = config;

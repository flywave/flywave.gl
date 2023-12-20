const config = {
    presets: [ 
        ['@babel/preset-flow'],
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

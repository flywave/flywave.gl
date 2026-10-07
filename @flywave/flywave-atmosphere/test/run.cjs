/* Copyright (C) 2025 flywave.gl contributors */
/*
 * 测试入口（bundle 内运行）。mocha 的 bdd 接口通过 root suite 的 pre-require
 * 钩子把 describe/it 安装到全局；bundle 里 require.context 直接执行测试模块，
 * 因此先手动触发一次钩子安装，再加载全部 *.test.ts。
 * 与 @flywave/flywave-3dtile-datasource/test/run.cjs 同模板。
 */
const Mocha = require("mocha");

const mocha = new Mocha({ ui: "bdd", reporter: "spec", timeout: 20000 });
mocha.suite.emit("pre-require", globalThis, "bundle", mocha);

const context = require.context("./", true, /\.test\.ts$/);
context.keys().forEach(key => context(key));

mocha.run(failures => {
    process.exitCode = failures ? 1 : 0;
});

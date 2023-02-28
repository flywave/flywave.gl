function svgToCanvas(svgDom, sx, sy, sw, sh) {
    return new Promise(function(reslove, reject) {
        var canvas = document.createElement('canvas'),
            ctx = canvas.getContext('2d'),
            midCanvas = document.createElement('canvas'),
            midCtx = midCanvas.getContext('2d'),
            svgString = new XMLSerializer().serializeToString(svgDom),
            DOMURL = self.URL || self.webkitURL || self,
            image = new Image(),
            svg = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });

        // document.body.appendChild(svg);
        image.src = DOMURL.createObjectURL(svg);

        image.onload = function() {
            midCanvas.width = sw;
            midCanvas.height = sh;
            createImageBitmap(this).then(function(e) {
                canvas.width = sw;
                canvas.height = sh;
                midCtx.drawImage(e, sx, sy, sw, sh);
                ctx.drawImage(midCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                DOMURL.revokeObjectURL(image.src);
                reslove(canvas);
            });

        };
        image.onerror = reject;
    });
}

export { svgToCanvas };

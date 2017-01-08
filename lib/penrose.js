var _ = require('lodash');
var canonStringify = require('canonical-json/index2');
var chalk = require('chalk');
var cheerio = require('cheerio');
var crypto = require('crypto');
var del = require('del');
var fs = require('fs-extra');
var gm = require('gm');
var mathjax = require('mathjax-node/lib/mj-single.js');
var mkdirp = require('mkdirp');
var path = require('path');
var pkg = require('../package.json');
var Promise = require('bluebird');
var svg2png = require('svg2png');

/**
 * Constants
 */
var PNG = 'png';
var SVG = 'svg';
var TEX = 'tex';
var INLINE_TEX = 'inline-tex';
var ASCIIMATH = 'asciimath';
var MATHML = 'mathml';
var RESIZE = 'resize';
var SCHEME_PUBLIC = 'public';

var MATHJAX_FORMAT_MAP = {};
_.forEach([
  [TEX, 'TeX'],
  [INLINE_TEX, 'inline-TeX'],
  [ASCIIMATH, 'AsciiMath'],
  [MATHML, 'MathML']
], function (value) {
  MATHJAX_FORMAT_MAP[value[0]] = value[1];
});

Promise.promisifyAll(fs);

fs.existsAsync = Promise.promisify(function exists2(path, exists2callback) {
  fs.exists(path, function callbackWrapper(exists) {
    exists2callback(null, exists);
  });
});

var mkdirpAsync = Promise.promisify(mkdirp);

/**
 *
 * @param  {String} value
 * @param  {Number} ex
 * @return {Number}
 */
function exToPx(value, ex) {
  var match = value.match(/^(.+)ex$/i);

  if (match) {
    return Number(match[1]) * ex;
  }

  return Number(value);
}

/**
 *
 * @param {Object} args
 * @return {Promise}
 */
function typesetMath(args) {
  var format = MATHJAX_FORMAT_MAP[args.inputFormat];

  if (_.isUndefined(format)) {
    throw new Error('Input format `' + args.inputFormat + '` is not supported');
  }

  if ([SVG].indexOf(args.outputFormat) < 0) {
    throw new Error('Output format `' + args.outputFormat + '` is not supported');
  }

  return new Promise(function (resolve, reject) {
    var config = _.assign(
      _.pick(args, ['ex', 'width']), {
        math: args.input,
        format,
        svg: true
      }
    );

    mathjax.typeset(config, function (result) {
      if (result.errors) {
        reject(result.errors);
      }
      else {
        resolve(result);
      }
    });
  });
}

/**
 *
 * @param  {Object} config
 * @return {Penrose}
 */
function Penrose(config) {
  this.config = _.assign({}, config);

  this.config.math = _.assign({
    displayErrors: false,
    displayMessages: false,
    undefinedCharError: false,
    MathJax: {
      SVG: {
        font: 'TeX'
      }
    },
    ex: 6, // ex-size in pixels
    width: 100, // Width of container (in ex) for linebreaking and tags
  }, config.math);

  mathjax.config(_.pick(this.config.math, ['displayErrors', 'displayMessages', 'undefinedCharError', 'MathJax']));
}

Penrose.prototype = {
  constructor: Penrose,
  /**
   *
   * @param  {Object} style
   * @param  {String} src Path to source image.
   * @param  {String} dist Path to destination image.
   * @return {Promise}
   */
  createDerivative: function (style, src, dist) {
    console.log('Creating derivative image', chalk.cyan(dist));

    var srcResolved = this.resolvePath(src);
    var distResolved = this.resolvePath(dist);

    return mkdirpAsync(path.dirname(distResolved))
      .then(function () {
        return new Promise(function (resolve, reject) {
          var stream = gm(srcResolved);

          _.forEach(style.actions, function (action) {
            if (action.name == RESIZE) {
              stream = stream.resize(action.width, action.height);
            }
            else {
              throw new Error('Action "' + action.name + '" is not supported');
            }
          });

          stream = stream
            .quality(style.quality)
            .noProfile()
            .write(distResolved, function (err) {
              if (err) {
                reject(err);
              }
              else {
                resolve(distResolved);
              }
            });
        });
      });
  },
  /**
   *
   * @param {Object} args
   * @return {Promise}
   */
  createMath: function (args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    var config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['input', 'inputFormat', 'outputFormat', 'ex', 'width'])
    );

    if (SVG === config.outputFormat) {
      return typesetMath(config)
        .then(function (result) {
          var $svg = cheerio.load(result.svg)('svg');
          var width = Math.ceil(exToPx($svg.attr('width'), config.ex));
          var height = Math.ceil(exToPx($svg.attr('height'), config.ex));

          return Promise.resolve({
            data: result.svg,
            width: width,
            height: height
          });
        });
    }
    else {
      throw new Error('Output format `' + config.outputFormat + '` is not supported');
    }
  },
  /**
   *
   * @param {Object} args
   * @return {Promise}
   */
  createMathDataURIBase64: function (args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    var config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['input', 'inputFormat', 'outputFormat', 'ex', 'width'])
    );

    if (SVG === config.outputFormat) {
      return typesetMath(config)
        .then(function (result) {
          var buffer = new Buffer(result.svg, 'utf-8');

          return Promise.resolve('data:image/svg+xml;base64,' + buffer.toString('base64'));
        });
    }
    else if (PNG === config.outputFormat) {
      config.outputFormat = SVG;

      return typesetMath(config)
        .then(function (result) {
          var buffer = new Buffer(result.svg, 'utf-8');
          var $svg = cheerio.load(result.svg)('svg');
          var width = Math.ceil(exToPx($svg.attr('width'), config.ex));
          var height = Math.ceil(exToPx($svg.attr('height'), config.ex));

          return svg2png(buffer, {
            width: width,
            height: height
          });
        })
        .then(function (buffer) {
          return Promise.resolve('data:image/png;base64,' + buffer.toString('base64'));
        });
    }
    else {
      throw new Error('Output format `' + config.outputFormat + '` is not supported');
    }
  },
  /**
   *
   * @param {Object} args
   * @return {Promise}
   */
  createMathFile: function (args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    var config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['input', 'inputFormat', 'output', 'outputFormat', 'ex', 'width'])
    );
    var outputResolved = this.resolvePath(config.output);

    if (SVG === config.outputFormat) {
      return mkdirpAsync(path.dirname(outputResolved))
        .then(function () {
          return typesetMath(config);
        })
        .then(function (result) {
          return fs.writeFileAsync(outputResolved, result.svg, 'utf-8');
        });
    }
    else if (PNG === config.outputFormat) {
      config.outputFormat = SVG;

      return mkdirpAsync(path.dirname(outputResolved))
        .then(function () {
          return typesetMath(config);
        })
        .then(function (result) {
          var buffer = new Buffer(result.svg, 'utf-8');
          var $svg = cheerio.load(result.svg)('svg');
          var width = Math.ceil(exToPx($svg.attr('width'), config.ex));
          var height = Math.ceil(exToPx($svg.attr('height'), config.ex));

          return svg2png(buffer, {
            width: width,
            height: height
          });
        })
        .then(function (buffer) {
          return fs.writeFileAsync(outputResolved, buffer);
        });
    }
    else {
      throw new Error('Output format `' + config.outputFormat + '` is not supported');
    }
  },
  /**
   *
   * @param  {String} uri
   * @return {String}
   */
  getScheme: function (uri) {
    var index = uri.indexOf('://');

    if (index < 0) {
      return;
    }

    return uri.substring(0, index);
  },
  /**
   *
   * @param  {String} uri
   * @return {String}
   */
  getTarget: function (uri) {
    var index = uri.indexOf('://');

    if (index < 0) {
      return uri;
    }

    return uri.substring(index + 3);
  },
  /**
   * Returns absolute URL.
   *
   * @param  {String} uri
   * @return {String}
   */
  getURL: function (uri) {
    var scheme = this.getScheme(uri);

    if (scheme === SCHEME_PUBLIC) {
      return '/' + this.resolvePath(uri);
    }

    return uri;
  },
  /**
   *
   * @param  {String} uri
   * @return {String}
   */
  resolvePath: function (uri) {
    var scheme = this.getScheme(uri);

    // If URI has no scheme, then return URI as is.
    if (_.isUndefined(scheme)) {
      return uri;
    }

    // If scheme is not supported, then throw error.
    if ([SCHEME_PUBLIC].indexOf(scheme) < 0) {
      throw new Error('Scheme `' + scheme + '` not supported');
    }

    var schemePath = _.get(this.config.schemes, scheme + '.path', '');
    var target = this.getTarget(uri);

    return schemePath + target;
  },
  /**
   *
   * @param  {String} styleName
   * @param  {String} uri
   * @return {String}
   */
  getStylePath: function (styleName, uri) {
    var scheme = this.getScheme(uri);
    var target;

    if (_.isUndefined(scheme)) {
      scheme = SCHEME_PUBLIC;
      target = uri;
    }
    else {
      target = this.getTarget(uri);
    }

    return scheme + '://styles/' + styleName + '/' + scheme + '/' + target;
  },
  /**
   * Returns absolute URL to derivative image.
   *
   * @param  {String} styleName
   * @param  {String} path
   * @return {String}
   */
  getStyleURL: function (styleName, path) {
    var uri = this.getStylePath(styleName, path);
    var scheme = this.getScheme(uri);

    if (scheme === SCHEME_PUBLIC) {
      return '/' + this.resolvePath(uri);
    }

    throw new Error('Scheme `' + scheme + '` not supported');
  },
  /**
   *
   * @param  {Object} args
   * @return {String}
   */
  getMathDigest: function (args) {
    var config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['ex', 'width'])
    );

    var data = pkg.version + ';' +
      canonStringify(config) + ';' +
      args.input.trim();

    return crypto.createHash('md5').update(data).digest('hex');
  },
  /**
   *
   * @param  {Object} args
   * @return {String}
   */
  getMathFilename: function (args) {
    var ext;

    if (SVG === args.outputFormat) {
      ext = '.svg';
    }
    else if (PNG === args.outputFormat) {
      ext = '.png';
    }
    else {
      throw new Error('Format `' + args.outputFormat + '` is not supported');
    }

    return this.getMathDigest(args) + ext;
  },
  /**
   *
   * @param  {String} outputFormat
   * @param  {String} uri
   * @return {String}
   */
  getMathPath: function (outputFormat, uri) {
    var scheme = this.getScheme(uri);
    var target;

    if (_.isUndefined(scheme)) {
      scheme = SCHEME_PUBLIC;
      target = uri;
    }
    else {
      target = this.getTarget(uri);
    }

    return scheme + '://math/' + outputFormat + '/' + target;
  },
  /**
   *
   * @param  {String} outputFormat
   * @param  {String} path
   * @return {String}
   */
  getMathURL: function (outputFormat, path) {
    var uri = this.getMathPath(outputFormat, path);
    var scheme = this.getScheme(uri);

    if (scheme === SCHEME_PUBLIC) {
      return '/' + this.resolvePath(uri);
    }

    throw new Error('Scheme `' + scheme + '` not supported');
  }
};

module.exports = {
  /**
   * Constants
   */
  PNG: PNG,
  SVG: SVG,
  TEX: TEX,
  INLINE_TEX: INLINE_TEX,
  ASCIIMATH: ASCIIMATH,
  MATHML: MATHML,
  RESIZE: RESIZE,
  SCHEME_PUBLIC: SCHEME_PUBLIC,
  Penrose: Penrose
};

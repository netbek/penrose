const _ = require('lodash');
const canonStringify = require('canonical-json/index2');
const chalk = require('chalk');
const cheerio = require('cheerio');
const crypto = require('crypto');
const fs = require('fs-extra');
const gm = require('gm');
const mathjax = require('mathjax-node/lib/mj-single.js');
const mkdirp = require('mkdirp');
const path = require('path');
const pkg = require('../package.json');
const Promise = require('bluebird');
const svg2png = require('svg2png');

/**
 * Constants
 */
const PUBLIC = 'public';
const TEMPORARY = 'temporary';
const PNG = 'png';
const SVG = 'svg';
const TEX = 'tex';
const INLINE_TEX = 'inline-tex';
const ASCIIMATH = 'asciimath';
const MATHML = 'mathml';
const RESIZE = 'resize';

const MATHJAX_FORMAT_MAP = {
  [TEX]: 'TeX',
  [INLINE_TEX]: 'inline-TeX',
  [ASCIIMATH]: 'AsciiMath',
  [MATHML]: 'MathML'
};

Promise.promisifyAll(fs);

const mkdirpAsync = Promise.promisify(mkdirp);

/**
 *
 * @param  {string} value
 * @param  {number} ex
 * @returns {number}
 */
function exToPx(value, ex) {
  const match = value.match(/^(.+)ex$/i);

  if (match) {
    return Number(match[1]) * ex;
  }

  return Number(value);
}

/**
 *
 * @param {Object} args
 * @returns {Promise}
 */
function typesetMath(args) {
  const format = MATHJAX_FORMAT_MAP[args.inputFormat];

  if (_.isUndefined(format)) {
    throw new Error('Input format `' + args.inputFormat + '` is not supported');
  }

  if (!~[SVG].indexOf(args.outputFormat)) {
    throw new Error(
      'Output format `' + args.outputFormat + '` is not supported'
    );
  }

  return new Promise((resolve, reject) => {
    const config = _.assign(_.pick(args, ['ex', 'width']), {
      math: args.input,
      format: format,
      svg: true
    });

    mathjax.typeset(config, result => {
      if (result.errors) {
        reject(result.errors);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 *
 * @param  {Object} config
 * @returns {Penrose}
 */
function Penrose(config) {
  this.config = {
    ...config,
    math: {
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
      ...config.math
    }
  };

  mathjax.config(
    _.pick(this.config.math, [
      'displayErrors',
      'displayMessages',
      'undefinedCharError',
      'MathJax'
    ])
  );
}

Penrose.prototype = {
  constructor: Penrose,
  /**
   *
   * @param  {Object} style
   * @param  {string} src - Path to source image.
   * @param  {string} dist - Path to destination image.
   * @returns {Promise}
   */
  createDerivative: function(style, src, dist) {
    console.log('Creating derivative image', chalk.cyan(dist));

    const srcResolved = this.resolvePath(src);
    const distResolved = this.resolvePath(dist);

    return mkdirpAsync(path.dirname(distResolved)).then(
      () =>
        new Promise((resolve, reject) => {
          let stream = gm(srcResolved);

          style.actions.forEach(action => {
            if (action.name === RESIZE) {
              stream = stream.resize(
                action.width,
                action.height,
                action.options
              );
            } else {
              throw new Error('Action "' + action.name + '" is not supported');
            }
          });

          stream = stream
            .quality(style.quality)
            .noProfile()
            .write(distResolved, err => {
              if (err) {
                reject(err);
              } else {
                resolve(distResolved);
              }
            });
        })
    );
  },
  /**
   *
   * @param {Object} args
   * @returns {Promise}
   */
  createMath: function(args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    const config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['input', 'inputFormat', 'outputFormat', 'ex', 'width'])
    );

    if (SVG === config.outputFormat) {
      return typesetMath(config).then(result => {
        const $svg = cheerio.load(result.svg)('svg');
        const width = Math.ceil(exToPx($svg.attr('width'), config.ex));
        const height = Math.ceil(exToPx($svg.attr('height'), config.ex));

        return Promise.resolve({
          data: result.svg,
          width: width,
          height: height
        });
      });
    }

    throw new Error(
      'Output format `' + config.outputFormat + '` is not supported'
    );
  },
  /**
   *
   * @param {Object} args
   * @returns {Promise}
   */
  createMathDataURIBase64: function(args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    const config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['input', 'inputFormat', 'outputFormat', 'ex', 'width'])
    );

    if (SVG === config.outputFormat) {
      return typesetMath(config).then(result => {
        const buffer = Buffer.from(result.svg, 'utf-8');

        return Promise.resolve(
          'data:image/svg+xml;base64,' + buffer.toString('base64')
        );
      });
    }

    if (PNG === config.outputFormat) {
      config.outputFormat = SVG;

      return typesetMath(config)
        .then(result => {
          const buffer = Buffer.from(result.svg, 'utf-8');
          const $svg = cheerio.load(result.svg)('svg');
          const width = Math.ceil(exToPx($svg.attr('width'), config.ex));
          const height = Math.ceil(exToPx($svg.attr('height'), config.ex));

          return svg2png(buffer, {
            width: width,
            height: height
          });
        })
        .then(buffer =>
          Promise.resolve('data:image/png;base64,' + buffer.toString('base64'))
        );
    }

    throw new Error(
      'Output format `' + config.outputFormat + '` is not supported'
    );
  },
  /**
   *
   * @param {Object} args
   * @returns {Promise}
   */
  createMathFile: function(args) {
    console.log('Typesetting math', chalk.cyan(args.input));

    const config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, [
        'input',
        'inputFormat',
        'output',
        'outputFormat',
        'ex',
        'width'
      ])
    );
    const outputResolved = this.resolvePath(config.output);

    if (SVG === config.outputFormat) {
      return mkdirpAsync(path.dirname(outputResolved))
        .then(() => typesetMath(config))
        .then(result => fs.writeFileAsync(outputResolved, result.svg, 'utf-8'));
    }

    if (PNG === config.outputFormat) {
      config.outputFormat = SVG;

      return mkdirpAsync(path.dirname(outputResolved))
        .then(() => typesetMath(config))
        .then(result => {
          const buffer = Buffer.from(result.svg, 'utf-8');
          const $svg = cheerio.load(result.svg)('svg');
          const width = Math.ceil(exToPx($svg.attr('width'), config.ex));
          const height = Math.ceil(exToPx($svg.attr('height'), config.ex));

          return svg2png(buffer, {
            width: width,
            height: height
          });
        })
        .then(buffer => fs.writeFileAsync(outputResolved, buffer));
    }

    throw new Error(
      'Output format `' + config.outputFormat + '` is not supported'
    );
  },
  /**
   *
   * @param  {string} uri
   * @returns {string}
   */
  getScheme: function(uri) {
    const index = uri.indexOf('://');

    if (!~index) {
      return undefined;
    }

    return uri.substring(0, index);
  },
  /**
   *
   * @param  {string} uri
   * @param  {string} scheme
   * @returns {string}
   */
  setScheme: function(uri, scheme) {
    return scheme + '://' + this.getTarget(uri);
  },
  /**
   *
   * @param  {string} uri
   * @returns {string}
   */
  getTarget: function(uri) {
    const index = uri.indexOf('://');

    if (!~index) {
      return uri;
    }

    return uri.substring(index + 3);
  },
  /**
   * Returns absolute URL.
   *
   * @param  {string} uri
   * @returns {string}
   */
  getURL: function(uri) {
    const scheme = this.getScheme(uri);

    if (PUBLIC === scheme || TEMPORARY === scheme) {
      return '/' + this.resolvePath(uri);
    }

    return uri;
  },
  /**
   *
   * @param  {string} uri
   * @returns {string}
   */
  resolvePath: function(uri) {
    const scheme = this.getScheme(uri);

    // If URI has no scheme, then return URI as is.
    if (_.isUndefined(scheme)) {
      return uri;
    }

    // If scheme is not supported, then throw error.
    if (PUBLIC !== scheme && TEMPORARY !== scheme) {
      throw new Error('Scheme `' + scheme + '` not supported');
    }

    const schemePath = _.get(this.config.schemes, scheme + '.path', '');
    const target = this.getTarget(uri);

    return schemePath + target;
  },
  /**
   *
   * @param  {string} styleName
   * @param  {string} uri
   * @returns {string}
   */
  getStylePath: function(styleName, uri) {
    let scheme = this.getScheme(uri);
    let target;

    if (_.isUndefined(scheme)) {
      scheme = PUBLIC;
      target = uri;
    } else {
      target = this.getTarget(uri);
    }

    return scheme + '://styles/' + styleName + '/' + target;
  },
  /**
   * Returns absolute URL to derivative image.
   *
   * @param  {string} styleName
   * @param  {string} path
   * @returns {string}
   */
  getStyleURL: function(styleName, path) {
    const uri = this.getStylePath(styleName, path);
    const scheme = this.getScheme(uri);

    if (PUBLIC === scheme || TEMPORARY === scheme) {
      return '/' + this.resolvePath(uri);
    }

    throw new Error('Scheme `' + scheme + '` not supported');
  },
  /**
   *
   * @param  {Object} args
   * @returns {string}
   */
  getMathDigest: function(args) {
    const config = _.assign(
      _.pick(this.config.math, ['ex', 'width']),
      _.pick(args, ['ex', 'width'])
    );

    const data =
      pkg.version + ';' + canonStringify(config) + ';' + args.input.trim();

    return crypto
      .createHash('md5')
      .update(data)
      .digest('hex');
  },
  /**
   *
   * @param  {Object} args
   * @returns {string}
   */
  getMathFilename: function(args) {
    let ext;

    if (SVG === args.outputFormat) {
      ext = '.svg';
    } else if (PNG === args.outputFormat) {
      ext = '.png';
    } else {
      throw new Error('Format `' + args.outputFormat + '` is not supported');
    }

    return this.getMathDigest(args) + ext;
  },
  /**
   *
   * @param  {string} outputFormat
   * @param  {string} uri
   * @returns {string}
   */
  getMathPath: function(outputFormat, uri) {
    let scheme = this.getScheme(uri);
    let target;

    if (_.isUndefined(scheme)) {
      scheme = PUBLIC;
      target = uri;
    } else {
      target = this.getTarget(uri);
    }

    return scheme + '://math/' + outputFormat + '/' + target;
  },
  /**
   *
   * @param  {string} outputFormat
   * @param  {string} path
   * @returns {string}
   */
  getMathURL: function(outputFormat, path) {
    const uri = this.getMathPath(outputFormat, path);
    const scheme = this.getScheme(uri);

    if (PUBLIC === scheme || TEMPORARY === scheme) {
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
  PUBLIC: PUBLIC,
  TEMPORARY: TEMPORARY,
  Penrose: Penrose
};

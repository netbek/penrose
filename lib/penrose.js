const _ = require('lodash');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const Promise = require('bluebird');
const replaceExt = require('replace-ext');
const sharp = require('sharp');

/**
 * Constants
 */
const PUBLIC = 'public';
const TEMPORARY = 'temporary';
const JPEG = 'jpeg';
const PNG = 'png';
const SVG = 'svg';
const WEBP = 'webp';
const RESIZE = 'resize';

const EXTNAME_FORMAT_MAP = {
  jpeg: JPEG,
  jpg: JPEG,
  png: PNG,
  webp: WEBP
};

const FORMAT_EXTNAME_MAP = {
  [JPEG]: 'jpg',
  [PNG]: 'png',
  [WEBP]: 'webp'
};

const JPEG_OPTIONS = [
  'quality',
  'progressive',
  'chromaSubsampling',
  'trellisQuantisation',
  'overshootDeringing',
  'optimiseScans',
  'optimizeScans',
  'optimiseCoding',
  'optimizeCoding',
  'quantisationTable',
  'quantizationTable',
  'force'
];

const PNG_OPTIONS = [
  'progressive',
  'compressionLevel',
  'adaptiveFiltering',
  'force'
];

const WEBP_OPTIONS = [
  'quality',
  'alphaQuality',
  'lossless',
  'nearLossless',
  'force'
];

const RESIZE_OPTIONS = [
  'width',
  'height',
  'fit',
  'position',
  'background',
  'kernel',
  'withoutEnlargement',
  'fastShrinkOnLoad'
];

Promise.promisifyAll(fs);

/**
 *
 * @param   {Object} config
 * @returns {Penrose}
 */
function Penrose(config) {
  this.config = {
    ...config
  };
}

Penrose.prototype = {
  constructor: Penrose,
  /**
   *
   * @param   {Object} style
   * @param   {string} src - Path to source image.
   * @param   {string} dist - Path to destination image.
   * @returns {Promise}
   */
  createDerivative: function (style, src, dist) {
    const srcPath = this.resolvePath(src);
    let distPath = this.resolvePath(dist);
    let distFormat = _.get(style, 'format');

    // If dist format is not given, then infer format from file extension.
    if (_.isUndefined(distFormat)) {
      distFormat =
        EXTNAME_FORMAT_MAP[_.trim(path.extname(dist), '.').toLowerCase()];
    }
    // If dist format is given, then set correct file extension.
    else {
      distPath = replaceExt(distPath, '.' + FORMAT_EXTNAME_MAP[distFormat]);
    }

    console.log(
      'Creating derivative image',
      chalk.cyan(dist),
      chalk.grey(distFormat)
    );

    return fs.mkdirp(path.dirname(distPath)).then(() => {
      let transformer = sharp(srcPath);

      style.actions.forEach((action) => {
        if (action.name === RESIZE) {
          transformer = transformer.resize(_.pick(action, RESIZE_OPTIONS));
        } else {
          throw new Error('Action "' + action.name + '" is not supported');
        }
      });

      if (distFormat === JPEG) {
        transformer = transformer.jpeg({
          ..._.pick(style, JPEG_OPTIONS),
          force: true
        });
      } else if (distFormat === PNG) {
        transformer = transformer.png({
          ..._.pick(style, PNG_OPTIONS),
          force: true
        });
      } else if (distFormat === WEBP) {
        transformer = transformer.webp({
          ..._.pick(style, WEBP_OPTIONS),
          force: true
        });
      }

      return transformer.toFile(distPath).then(() => distPath);
    });
  },

  /**
   *
   * @param   {string} uri
   * @returns {string}
   */
  getScheme: function (uri) {
    const index = uri.indexOf('://');

    if (!~index) {
      return undefined;
    }

    return uri.substring(0, index);
  },

  /**
   *
   * @param   {string} uri
   * @param   {string} scheme
   * @returns {string}
   */
  setScheme: function (uri, scheme) {
    return scheme + '://' + this.getTarget(uri);
  },

  /**
   *
   * @param   {string} uri
   * @returns {string}
   */
  getTarget: function (uri) {
    const index = uri.indexOf('://');

    if (!~index) {
      return uri;
    }

    return uri.substring(index + 3);
  },

  /**
   * Returns absolute URL.
   *
   * @param   {string} uri
   * @returns {string}
   */
  getURL: function (uri) {
    const scheme = this.getScheme(uri);

    if (PUBLIC === scheme || TEMPORARY === scheme) {
      return '/' + this.resolvePath(uri);
    }

    return uri;
  },

  /**
   *
   * @param   {string} uri
   * @returns {string}
   */
  resolvePath: function (uri) {
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
   * @param   {string} styleName
   * @param   {string} uri
   * @param   {format} format
   * @returns {string}
   */
  getStylePath: function (styleName, uri, format) {
    let scheme = this.getScheme(uri);
    let target;

    if (_.isUndefined(scheme)) {
      scheme = PUBLIC;
      target = uri;
    } else {
      target = this.getTarget(uri);
    }

    if (!_.isUndefined(format)) {
      target = replaceExt(target, '.' + FORMAT_EXTNAME_MAP[format]);
    }

    return scheme + '://styles/' + styleName + '/' + target;
  },

  /**
   * Returns absolute URL to derivative image.
   *
   * @param   {string} styleName
   * @param   {string} path
   * @param   {string} format
   * @returns {string}
   */
  getStyleURL: function (styleName, path, format) {
    const uri = this.getStylePath(styleName, path, format);
    const scheme = this.getScheme(uri);

    if (PUBLIC === scheme || TEMPORARY === scheme) {
      return '/' + this.resolvePath(uri);
    }

    throw new Error('Scheme `' + scheme + '` not supported');
  }
};

module.exports = {
  JPEG,
  PNG,
  SVG,
  WEBP,
  RESIZE,
  PUBLIC,
  TEMPORARY,
  Penrose
};

var _ = require('lodash');
var chalk = require('chalk');
var del = require('del');
var gm = require('gm');
var mkdirp = require('mkdirp');
var path = require('path');
var Promise = require('bluebird');

var mkdirpAsync = Promise.promisify(mkdirp);

/**
 * Constants
 */
var RESIZE = 'resize';
var SCHEME_PUBLIC = 'public';

/**
 *
 * @param  {Object} config
 * @return {Penrose}
 */
function Penrose(config) {
  this.config = config;
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
  }
};

module.exports = {
  /**
   * Constants
   */
  RESIZE: RESIZE,
  SCHEME_PUBLIC: SCHEME_PUBLIC,
  Penrose: Penrose
};

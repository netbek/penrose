const _ = require('lodash');
const chai = require('chai');
const {assert} = chai;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const globPromise = require('glob-promise');
const {Penrose} = require('..');
const Promise = require('bluebird');

Promise.promisifyAll(fs);

describe('Penrose', function () {
  const testDir = __dirname.substring(process.cwd().length + 1) + '/';

  const config = {
    schemes: {
      public: {
        path: testDir + 'data/files/'
      }
    },
    styles: {
      small: {
        actions: [
          {
            name: 'resize',
            width: 480
          }
        ],
        quality: 75
      }
    }
  };

  const penrose = new Penrose(config);

  /**
   *
   * @param   {Array} patterns
   * @param   {Object} options
   * @returns {Promise}
   */
  function multiGlob(patterns, options) {
    let matches = [];

    return Promise.mapSeries(patterns, function (pattern) {
      return globPromise(pattern, options).then(function (files) {
        matches = matches.concat(files);
      });
    }).then(function () {
      return Promise.resolve(matches);
    });
  }

  /**
   * Deletes test output files.
   *
   * @returns {Promise}
   */
  function deleteOutput() {
    const dirs = _.map(config.schemes, function (scheme) {
      return scheme.path + 'styles/';
    }).concat([config.schemes.public.path + 'math/']);

    return Promise.mapSeries(dirs, (dir) => fs.removeAsync(dir));
  }

  beforeEach(function (done) {
    deleteOutput().then(function () {
      done();
    });
  });

  after(function (done) {
    deleteOutput().then(function () {
      done();
    });
  });

  describe('resolvePath', function () {
    it('Should return expected path if URI has scheme', function () {
      const actual = penrose.resolvePath('public://dir/file.jpg');
      const expected = config.schemes.public.path + 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected path if URI has no scheme', function () {
      const actual = penrose.resolvePath('dir/file.jpg');
      const expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should throw error if URI has unsupported scheme', function () {
      let actual;
      const expected = 'error';

      try {
        actual = penrose.resolvePath('http://dir/file.jpg');
      } catch (e) {
        actual = e;
      }

      assert.typeOf(actual, expected);
    });
  });

  describe('getScheme', function () {
    it('Should return expected scheme if URI has scheme', function () {
      const actual = penrose.getScheme('public://dir/file.jpg');
      const expected = 'public';

      assert.equal(actual, expected);
    });

    it('Should return undefined scheme if URI has no scheme', function () {
      const actual = penrose.getScheme('dir/file.jpg');
      const expected = undefined;

      assert.equal(actual, expected);
    });
  });

  describe('getTarget', function () {
    it('Should return expected target if URI has scheme', function () {
      const actual = penrose.getTarget('public://dir/file.jpg');
      const expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected target if URI has no scheme', function () {
      const actual = penrose.getTarget('dir/file.jpg');
      const expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getURL', function () {
    it('Should return expected URL if URI has scheme', function () {
      const actual = penrose.getURL('public://dir/file.jpg');
      const expected = '/' + config.schemes.public.path + 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has no scheme', function () {
      const actual = penrose.getURL('dir/file.jpg');
      const expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has unsupported scheme', function () {
      const actual = penrose.getURL('http://dir/file.jpg');
      const expected = 'http://dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getStylePath', function () {
    it('Should return expected path if URI has scheme', function () {
      const actual = penrose.getStylePath('small', 'private://dir/file.jpg');
      const expected = 'private://styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected path if URI has no scheme', function () {
      const actual = penrose.getStylePath('small', 'dir/file.jpg');
      const expected = 'public://styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getStyleURL', function () {
    it('Should return expected URL if URI has scheme', function () {
      const actual = penrose.getStyleURL('small', 'public://dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has no scheme', function () {
      const actual = penrose.getStyleURL('small', 'dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should throw error if URI has unsupported scheme', function () {
      let actual;
      const expected = 'error';

      try {
        actual = penrose.getStyleURL('small', 'http://dir/file.jpg');
      } catch (e) {
        actual = e;
      }

      assert.typeOf(actual, expected);
    });
  });

  describe('createDerivative', function () {
    it('Should create derivative images', function () {
      const actual = function () {
        return multiGlob(
          _.map(config.schemes, function (scheme) {
            return scheme.path + '**/*';
          }),
          {
            nodir: true
          }
        )
          .then(function (files) {
            const tasks = [];

            _.forEach(files, function (file) {
              _.forEach(config.styles, function (style, styleName) {
                tasks.push({
                  style: style,
                  src: file,
                  dist: penrose.getStylePath(styleName, file)
                });
              });
            });

            return Promise.mapSeries(tasks, function (task) {
              return penrose.createDerivative(task.style, task.src, task.dist);
            });
          })
          .then(function () {
            return multiGlob(
              _.map(config.schemes, function (scheme) {
                return scheme.path + 'styles/**/*';
              }),
              {
                nodir: true
              }
            );
          });
      };

      const expected = [
        config.schemes.public.path +
          'styles/small/' +
          config.schemes.public.path +
          'The_Earth_seen_from_Apollo_17.jpg'
      ];

      return assert.eventually.deepEqual(actual(), expected);
    });
  });

  describe('createMathFile', function () {
    it('Should create math files', function () {
      const math = [
        {
          data: 'E = mc^2',
          format: 'tex'
        }
      ];

      const tasks = [];
      const expected = [];

      _.forEach(math, function (value) {
        const outputFormat = 'svg';
        const task = {
          input: value.data,
          inputFormat: value.format,
          outputFormat: outputFormat
        };
        const filename = penrose.getMathFilename(task);
        task.output = penrose.getMathPath(outputFormat, filename);

        tasks.push(task);

        expected.push(config.schemes.public.path + 'math/svg/' + filename);
      });

      const actual = function () {
        return Promise.mapSeries(tasks, function (task) {
          return penrose.createMathFile(task);
        }).then(function () {
          return multiGlob(
            _.map(config.schemes, function (scheme) {
              return scheme.path + 'math/**/*';
            }),
            {
              nodir: true
            }
          );
        });
      };

      return assert.eventually.deepEqual(actual(), expected);
    });
  });
});

import _ from 'lodash';
import Promise from 'bluebird';
import fs from 'fs-extra';
import globPromise from 'glob-promise';
import path from 'path';
import {describe, expect, test} from 'vitest';
import {Penrose} from '../penrose';

const dir = import.meta.dirname;

describe('Penrose', () => {
  const config = {
    schemes: {
      public: {
        path: path.join(dir, 'data/files') + path.sep
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
    }).then(() => {
      return Promise.resolve(matches);
    });
  }

  describe('resolvePath', () => {
    test('Should return expected path if URI has scheme', () => {
      const actual = penrose.resolvePath('public://dir/file.jpg');
      const expected = config.schemes.public.path + 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected path if URI has no scheme', () => {
      const actual = penrose.resolvePath('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should throw error if URI has unsupported scheme', () => {
      expect(() => penrose.resolvePath('http://dir/file.jpg')).toThrowError(
        'Scheme `http` not supported'
      );
    });
  });

  describe('getScheme', () => {
    test('Should return expected scheme if URI has scheme', () => {
      const actual = penrose.getScheme('public://dir/file.jpg');
      const expected = 'public';

      expect(actual).toEqual(expected);
    });

    test('Should return undefined scheme if URI has no scheme', () => {
      const actual = penrose.getScheme('dir/file.jpg');
      const expected = undefined;

      expect(actual).toEqual(expected);
    });
  });

  describe('getTarget', () => {
    test('Should return expected target if URI has scheme', () => {
      const actual = penrose.getTarget('public://dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected target if URI has no scheme', () => {
      const actual = penrose.getTarget('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getURL', () => {
    test('Should return expected URL if URI has scheme', () => {
      const actual = penrose.getURL('public://dir/file.jpg');
      const expected = '/' + config.schemes.public.path + 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has no scheme', () => {
      const actual = penrose.getURL('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has unsupported scheme', () => {
      const actual = penrose.getURL('http://dir/file.jpg');
      const expected = 'http://dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getStylePath', () => {
    test('Should return expected path if URI has scheme', () => {
      const actual = penrose.getStylePath('small', 'private://dir/file.jpg');
      const expected = 'private://styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected path if URI has no scheme', () => {
      const actual = penrose.getStylePath('small', 'dir/file.jpg');
      const expected = 'public://styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getStyleURL', () => {
    test('Should return expected URL if URI has scheme', () => {
      const actual = penrose.getStyleURL('small', 'public://dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has no scheme', () => {
      const actual = penrose.getStyleURL('small', 'dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should throw error if URI has unsupported scheme', () => {
      expect(() =>
        penrose.getStyleURL('small', 'http://dir/file.jpg')
      ).toThrowError('Scheme `http` not supported');
    });
  });

  describe('createDerivative', () => {
    test('Should create derivative images', async () => {
      await fs.remove(path.join(dir, 'data/files/styles'));

      const files = await multiGlob(
        _.map(config.schemes, function (scheme) {
          return scheme.path + '**/*';
        }),
        {
          nodir: true
        }
      );

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

      await Promise.mapSeries(tasks, function (task) {
        return penrose.createDerivative(task.style, task.src, task.dist);
      });

      const actual = await multiGlob(
        _.map(config.schemes, function (scheme) {
          return scheme.path + 'styles/**/*';
        }),
        {
          nodir: true
        }
      );

      const expected = [
        path.join(
          config.schemes.public.path,
          'styles/small',
          config.schemes.public.path,
          'The_Earth_seen_from_Apollo_17.jpg'
        )
      ];

      expect(actual).toEqual(expected);

      await fs.remove(path.join(dir, 'data/files/styles'));
    });
  });

  describe('createMathFile', () => {
    test('Should create math files', async () => {
      await fs.remove(path.join(dir, 'data/files/math'));

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

        expected.push(
          path.join(config.schemes.public.path, 'math/svg', filename)
        );
      });

      await Promise.mapSeries(tasks, function (task) {
        return penrose.createMathFile(task);
      });

      const actual = await multiGlob(
        _.map(config.schemes, function (scheme) {
          return scheme.path + 'math/**/*';
        }),
        {
          nodir: true
        }
      );

      expect(actual).toEqual(expected);

      await fs.remove(path.join(dir, 'data/files/math'));
    });
  });
});

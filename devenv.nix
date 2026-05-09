{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:
{
  env.DEVENV_TASKS_QUIET = 1;

  packages = with pkgs; [
    graphicsmagick
    nixfmt
    pre-commit
  ];

  languages = {
    javascript = {
      enable = true;
      package = pkgs.nodejs_22;
      npm = {
        enable = true;
        install = {
          enable = true;
        };
      };
    };
  };

  dotenv = {
    disableHint = true;
  };

  enterShell = ''
    if [ -d ".git" ]; then
      pre-commit install --overwrite > /dev/null 2>&1
    fi
  '';
}

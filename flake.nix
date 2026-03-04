{
  description = "Dev shell for jupytutor_server";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_20
            pkgs.yarn
            pkgs.screen
            pkgs.ncurses
          ];
          shellHook = ''
            export SHELL=${pkgs.bashInteractive}/bin/bash
            export TERMINFO_DIRS="${pkgs.ncurses}/share/terminfo''${TERMINFO_DIRS:+:$TERMINFO_DIRS}"
            export DEV_LOG_FULL_PROMPT=1
            export DEV_LOG_FULL_PROMPT_FILE="/tmp/jupytutor_server_full_prompt.log"
            echo "Run: yarn install"
            echo "Full prompt logs -> $DEV_LOG_FULL_PROMPT_FILE"
          '';
        };
      });
}

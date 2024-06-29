NAME=osk-for-fcitx-jp
DOMAIN=52hertz-reunion.site

.PHONY: all pack install clean

all: dist/extension.js

node_modules: package.json
	npm ci

dist/extension.js: node_modules
	npm run build

$(NAME).zip: dist/extension.js
	@cp -r data dist/
	@cp metadata.json dist/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	@touch ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@rm -rf ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)
	@mv dist ~/.local/share/gnome-shell/extensions/$(NAME)@$(DOMAIN)

clean:
	@rm -rf dist node_modules $(NAME).zip
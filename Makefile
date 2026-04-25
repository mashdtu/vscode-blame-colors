VSIX    := $(shell node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'")
VERSION := $(shell node -p "require('./package.json').version")

.PHONY: all compile watch package install release clean

all: compile

compile:
	npm run compile

watch:
	npm run watch

package: compile
	vsce package

install: package
	code --install-extension $(VSIX)

clean:
	rm -rf out $(VSIX)

release: package
	@if [ -n "$$(git status --porcelain)" ]; then git add -A && git commit -m "chore: release v$(VERSION)"; fi
	@git tag v$(VERSION) 2>/dev/null || echo "Tag v$(VERSION) already exists, skipping."
	@git push origin v$(VERSION) 2>/dev/null || echo "Tag already on remote, skipping push."
	gh release create v$(VERSION) $(VSIX) --title "v$(VERSION)" --notes "Release v$(VERSION)"

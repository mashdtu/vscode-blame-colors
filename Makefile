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
	@if [ -n "$$(git status --porcelain)" ]; then echo "Working tree is dirty. Commit or stash changes first."; exit 1; fi
	git tag v$(VERSION)
	git push origin v$(VERSION)
	gh release create v$(VERSION) $(VSIX) --title "v$(VERSION)" --notes "Release v$(VERSION)"

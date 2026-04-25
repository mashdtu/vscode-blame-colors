DIST    := dist
VSIX    := $(DIST)/$(shell node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'")
VERSION := $(shell node -p "require('./package.json').version")

.PHONY: all compile watch package install release clean

all: compile

compile:
	npm run compile

watch:
	npm run watch

package: compile
	mkdir -p $(DIST)
	vsce package --out $(DIST)/

install: package
	code --install-extension $(VSIX)

clean:
	rm -rf out $(DIST)

release: compile
	@node -e "\
	  const fs=require('fs'), p=JSON.parse(fs.readFileSync('package.json','utf8'));\
	  const [a,b,c]=p.version.split('.').map(Number);\
	  p.version=a+'.'+b+'.'+(c+1);\
	  fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');\
	  console.log('Bumped to '+p.version);"
	@mkdir -p $(DIST)
	@$(MAKE) --no-print-directory package
	$(eval VERSION := $(shell node -p "require('./package.json').version"))
	$(eval VSIX    := $(DIST)/$(shell node -p "const p=require('./package.json'); p.name+'-'+p.version+'.vsix'"))
	@if [ -n "$$(git status --porcelain)" ]; then git add -A && git commit -m "chore: release v$(VERSION)"; fi
	@git tag v$(VERSION) 2>/dev/null || echo "Tag v$(VERSION) already exists, skipping."
	@git push origin v$(VERSION) 2>/dev/null || echo "Tag already on remote, skipping push."
	@if [ -n "$$(git status --porcelain)" ]; then git add -A && git commit -m "chore: release v$(VERSION)"; fi
	@git tag v$(VERSION) 2>/dev/null || echo "Tag v$(VERSION) already exists, skipping."
	@git push origin v$(VERSION) 2>/dev/null || echo "Tag already on remote, skipping push."
	gh release create v$(VERSION) $(VSIX) --title "v$(VERSION)" --notes "Release v$(VERSION)"

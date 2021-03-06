
module fairygui {

    export class UIPackage {
        private _id: string;
        private _name: string;
        private _basePath: string;
        private _items: Array<PackageItem>;
        private _itemsById: any;
        private _itemsByName: any;
        private _resKey: string;
        private _resData: any;
        private _customId: string;
        private _sprites: any;
        
        //internal
        public static _constructing: number = 0;

        private static _packageInstById: any = {};
        private static _packageInstByName: any = {};
        private static _bitmapFonts: any = {};

        private static sep0: string = ",";
        private static sep1: string = "\n";
        private static sep2: string = " ";
        private static sep3: string = "=";

        public constructor() {
            this._items = new Array<PackageItem>();
            this._sprites = {};
        }

        public static getById(id: string): UIPackage {
            return UIPackage._packageInstById[id];
        }

        public static getByName(name: string): UIPackage {
            return UIPackage._packageInstByName[name];
        }

        public static addPackage(resKey: string): UIPackage {
            var pkg: UIPackage = new UIPackage();
            pkg.create(resKey);
            UIPackage._packageInstById[pkg.id] = pkg;
            UIPackage._packageInstByName[pkg.name] = pkg;
            pkg.customId = resKey;
            return pkg;
        }

        public static removePackage(packageId: string): void {
            var pkg: UIPackage = UIPackage._packageInstById[packageId];
            pkg.dispose();
            delete UIPackage._packageInstById[pkg.id];
            if(pkg._customId != null)
                delete UIPackage._packageInstById[pkg._customId];
            delete UIPackage._packageInstByName[pkg.name];
        }

        public static createObject(pkgName: string,resName: string,userClass: any = null): GObject {
            var pkg: UIPackage = UIPackage.getByName(pkgName);
            if(pkg)
                return pkg.createObject(resName,userClass);
            else
                return null;
        }

        public static createObjectFromURL(url: string,userClass: any = null): GObject {
            var pi: PackageItem = UIPackage.getItemByURL(url);
            if(pi)
                return pi.owner.createObject2(pi,userClass);
            else
                return null;
        }

        public static getItemURL(pkgName: string,resName: string): string {
            var pkg: UIPackage = UIPackage.getByName(pkgName);
            if(!pkg)
                return null;

            var pi: PackageItem = pkg._itemsByName[resName];
            if(!pi)
                return null;

            return "ui://" + pkg.id + pi.id;
        }

        public static getItemByURL(url: string): PackageItem {
            if(ToolSet.startsWith(url,"ui://")) {
                var pkgId: string = url.substr(5,8);
                var srcId: string = url.substr(13);
                var pkg: UIPackage = UIPackage.getById(pkgId);
                if(pkg)
                    return pkg.getItem(srcId);
            }
            return null;
        }

        public static getBitmapFontByURL(url: string): BitmapFont {
            return UIPackage._bitmapFonts[url];
        }

        private create(resKey: string): void {
            this._resKey = resKey;

            this.loadPackage();
        }

        private loadPackage(): void {
            var str: string;
            var arr: string[];

            this.decompressPackage(RES.getRes(this._resKey));

            str = this.getDesc("sprites.bytes");

            arr = str.split(UIPackage.sep1);
            var cnt: number = arr.length;
            for(var i: number = 1;i < cnt;i++) {
                str = arr[i];
                if(!str)
                    continue;

                var arr2: string[] = str.split(UIPackage.sep2);

                var sprite: AtlasSprite = new AtlasSprite();
                var itemId: string = arr2[0];
                var binIndex: number = parseInt(arr2[1]);
                if(binIndex >= 0)
                    sprite.atlas = "atlas" + binIndex;
                else {
                    var pos: number = itemId.indexOf("_");
                    if(pos == -1)
                        sprite.atlas = "atlas_" + itemId;
                    else
                        sprite.atlas = "atlas_" + itemId.substr(0,pos);
                }

                sprite.rect.x = parseInt(arr2[2]);
                sprite.rect.y = parseInt(arr2[3]);
                sprite.rect.width = parseInt(arr2[4]);
                sprite.rect.height = parseInt(arr2[5]);
                sprite.rotated = arr2[6] == "1";
                this._sprites[itemId] = sprite;
            }

            str = this.getDesc("package.xml");
            var xml: any = egret.XML.parse(str);

            this._id = xml.attributes.id;
            this._name = xml.attributes.name;

            var resources: any = xml.children[0].children;

            this._itemsById = {};
            this._itemsByName = {};
            var pi: PackageItem;
            var cxml: any;

            var length1: number = resources.length;
            for(var i1: number = 0;i1 < length1;i1++) {
                cxml = resources[i1];
                pi = new PackageItem();
                pi.type = parsePackageItemType(cxml.name);
                pi.id = cxml.attributes.id;
                pi.name = cxml.attributes.name;
                pi.file = cxml.attributes.file;
                str = cxml.attributes.size;
                if(str) {
                    arr = str.split(UIPackage.sep0);
                    pi.width = parseInt(arr[0]);
                    pi.height = parseInt(arr[1]);
                }
                switch(pi.type) {
                    case PackageItemType.Image: {
                        str = cxml.attributes.scale;
                        if(str == "9grid") {
                            pi.scale9Grid = new egret.Rectangle();
                            str = cxml.attributes.scale9grid;
                            if(str) {
                                arr = str.split(UIPackage.sep0);
                                pi.scale9Grid.x = parseInt(arr[0]);
                                pi.scale9Grid.y = parseInt(arr[1]);
                                pi.scale9Grid.width = parseInt(arr[2]);
                                pi.scale9Grid.height = parseInt(arr[3]);
                            }
                        }
                        else if(str == "tile") {
                            pi.scaleByTile = true;
                        }
                        str = cxml.attributes.smoothing;
                        pi.smoothing = str != "false";
                        break;
                    }
                }

                pi.owner = this;
                this._items.push(pi);
                this._itemsById[pi.id] = pi;
                if(pi.name != null)
                    this._itemsByName[pi.name] = pi;
            }

            cnt = this._items.length;
            for(i = 0;i < cnt;i++) {
                pi = this._items[i];
                if(pi.type == PackageItemType.Font) {
                    this.loadFont(pi);
                    UIPackage._bitmapFonts[pi.bitmapFont.id] = pi.bitmapFont;
                }
            }
        }

        private decompressPackage(buf: ArrayBuffer): void {
            this._resData = {};
        
            var inflater: Zlib.RawInflate = new Zlib.RawInflate(buf);
            var data: Uint8Array = inflater.decompress();
            var tmp: egret.ByteArray = new egret.ByteArray();
            var source: string = tmp["decodeUTF8"](data); //ByteArray.decodeUTF8 is private @_@
            var curr: number = 0;            
            var fn: string;
            var size: number;
            while(true)
            {
                var pos:number = source.indexOf("|", curr);
                if(pos == -1)
                    break;
                fn = source.substring(curr,pos);
                curr = pos + 1;
                pos = source.indexOf("|",curr);
                size = parseInt(source.substring(curr,pos));
                curr = pos + 1;
                this._resData[fn] = source.substr(curr,size);
                curr += size;
            }            
        }

        public dispose(): void {
            var cnt:number=this._items.length;
            for(var i: number = 0;i < cnt;i++) {
                var pi: PackageItem = this._items[i];
                var texture: egret.Texture = pi.texture;
                if(texture != null)
                    texture.dispose();
                else if(pi.frames != null) {
                    var frameCount: number = pi.frames.length;
                    for(var j: number = 0;j < frameCount;j++) {
                        texture = pi.frames[j].texture;
                        if(texture != null)
                            texture.dispose();
                    }
                }
                else if(pi.bitmapFont != null) {
                    delete UIPackage._bitmapFonts[pi.bitmapFont.id];
                }
            }
        }

        public get id(): string {
            return this._id;
        }

        public get name(): string {
            return this._name;
        }

        public get customId(): string {
            return this._customId;
        }

        public set customId(value: string) {
            if (this._customId != null)
                delete UIPackage._packageInstById[this._customId];
            this._customId = value;
            if (this._customId != null)
                UIPackage._packageInstById[this._customId] = this;
        }

        public createObject(resName: string, userClass: any= null): GObject {
            var pi: PackageItem = this._itemsByName[resName];
            if (pi)
                return this.createObject2(pi, userClass);
            else
                return null;
        }

        public createObject2(pi: fairygui.PackageItem, userClass: any= null): GObject {
            var g: GObject;
            if (pi.type == PackageItemType.Component) {
                if (userClass != null)
                    g = new userClass();
                else
                    g = UIObjectFactory.newObject(pi);
            }
            else
                g = UIObjectFactory.newObject(pi);

            if (g == null)
                return null;

            UIPackage._constructing++;
            g.constructFromResource(pi);
            UIPackage._constructing--;
            return g;
        }

        public getItem(itemId: string): PackageItem {
            return this._itemsById[itemId];
        }

        public getItemAssetByName(resName: string): any {
            var pi: PackageItem = this._itemsByName[resName];
            if (pi == null) {
                throw "Resource not found -" + resName;
            }

            return this.getItemAsset(pi);
        }

        public getItemAsset(item: PackageItem): any {
            switch (item.type) {
                case PackageItemType.Image:
                    if (!item.decoded) {
                        item.decoded = true;
                        var sprite: AtlasSprite = this._sprites[item.id];
                        if (sprite != null)
                            item.texture = this.createSpriteTexture(sprite);
                    }
                    return item.texture;

                case PackageItemType.Atlas:
                    if (!item.decoded) {
                        item.decoded = true;
                        var fileName:string = (item.file != null && item.file.length > 0) ? item.file : (item.id + ".png");
                        item.texture = RES.getRes(this._resKey + "@" + ToolSet.getFileName(fileName));
                    }
                    return item.texture;

                case PackageItemType.Sound:
                    if (!item.decoded) {
                        item.decoded = true;
                        item.sound = RES.getRes(this._resKey + "@" + item.id);
                    }
                    return item.sound;

                case PackageItemType.Font:
                    if (!item.decoded) {
                        item.decoded = true;
                        this.loadFont(item);
                    }
                    return item.bitmapFont;

                case PackageItemType.MovieClip:
                    if (!item.decoded) {
                        item.decoded = true;
                        this.loadMovieClip(item);
                    }
                    return item.frames;

                case PackageItemType.Component:
                    if (!item.decoded) {
                        item.decoded = true;
                        var str: string = this.getDesc(item.id + ".xml");
                        item.componentData = egret.XML.parse(str);
                    }
                    return item.componentData;

                default:
                    return RES.getRes(this._resKey + "@" + item.id);
            }
        }
        
        private getDesc(fn:string):string {
            return this._resData[fn];
        }

        private createSpriteTexture(sprite: AtlasSprite): egret.Texture {
            var atlasItem: PackageItem = this._itemsById[sprite.atlas];
            if (atlasItem != null) {
                var atlasTexture: egret.Texture = this.getItemAsset(atlasItem);
                if(atlasTexture == null)
                    return null;
                else
                    return this.createSubTexture(atlasTexture,sprite.rect);
            }
            else
                return null;
        }

        private createSubTexture(atlasTexture: egret.Texture,uvRect: egret.Rectangle): egret.Texture {
            var texture: egret.Texture = new egret.Texture();
            texture._bitmapData = atlasTexture._bitmapData;
            texture.$initData(atlasTexture._bitmapX + uvRect.x,atlasTexture._bitmapY + uvRect.y,
                uvRect.width,uvRect.height,0,0,uvRect.width,uvRect.height,
                atlasTexture._sourceWidth,atlasTexture._sourceHeight);
            return texture;
        }

        private loadMovieClip(item: PackageItem): void {
            var xml: any = egret.XML.parse(this.getDesc(item.id + ".xml"));
            item.pivot = new egret.Point();
            var str: string = xml.attributes.pivot;
            if (str) {
                var arr: string[] = str.split(UIPackage.sep0);
                item.pivot.x = parseInt(arr[0]);
                item.pivot.y = parseInt(arr[1]);
            }

            str = xml.attributes.interval;
            if (str != null)
                item.interval = parseInt(str);
            str = xml.attributes.swing;
            if (str != null)
                item.swing = str == "true";
            str = xml.attributes.repeatDelay;
            if (str != null)
                item.repeatDelay = parseInt(str);

            var frameCount: number = parseInt(xml.attributes.frameCount);
            item.frames = new Array<Frame>(frameCount);
            var frameNodes: any = xml.children[0].children;
            for(var i: number = 0;i < frameCount;i++) {
                var frame: Frame = new Frame();
                var frameNode: any = frameNodes[i];
                str = frameNode.attributes.rect;
                arr = str.split(UIPackage.sep0);
                frame.rect = new egret.Rectangle(parseInt(arr[0]),parseInt(arr[1]),parseInt(arr[2]),parseInt(arr[3]));
                str = frameNode.attributes.addDelay;
                if(str)
                    frame.addDelay = parseInt(str);
                item.frames[i] = frame;

                var sprite: AtlasSprite = this._sprites[item.id + "_" + i];
                if(sprite != null) {
                    frame.texture = this.createSpriteTexture(sprite);
                }
            }
        }

        private loadFont(item: PackageItem): void {
            var font: BitmapFont = new BitmapFont();
            font.id = "ui://" + this.id + item.id;
            var str: string = this.getDesc(item.id + ".fnt");

            var lines: string[] = str.split(UIPackage.sep1);
            var lineCount: number = lines.length;
            var i: number = 0;
            var kv: any = {};
            var ttf: boolean = false;
            var size: number = 0;
            var xadvance: number = 0;
            var resizable: boolean = false;
            var atlasOffsetX: number = 0, atlasOffsetY: number = 0;
            var charImg: PackageItem;
            var mainTexture: egret.Texture;

            for (i = 0; i < lineCount; i++) {
                str = lines[i];
                if (str.length == 0)
                    continue;

                str = ToolSet.trim(str);
                var arr: string[] = str.split(UIPackage.sep2);
                for (var j: number = 1; j < arr.length; j++) {
                    var arr2: string[] = arr[j].split(UIPackage.sep3);
                    kv[arr2[0]] = arr2[1];
                }

                str = arr[0];
                if (str == "char") {
                    var bg: BMGlyph = new BMGlyph();
                    bg.x = isNaN(kv.x) ? 0 : parseInt(kv.x);
                    bg.y = isNaN(kv.y) ? 0 : parseInt(kv.y);
                    bg.offsetX = isNaN(kv.xoffset) ? 0 : parseInt(kv.xoffset);
                    bg.offsetY = isNaN(kv.yoffset) ? 0 : parseInt(kv.yoffset);
                    bg.width = isNaN(kv.width) ? 0 : parseInt(kv.width);
                    bg.height = isNaN(kv.height) ? 0 : parseInt(kv.height);
                    bg.advance = isNaN(kv.xadvance) ? 0 : parseInt(kv.xadvance);
                    if (kv.chnl != undefined) {
                        bg.channel = parseInt(kv.chnl);
                        if (bg.channel == 15)
                            bg.channel = 4;
                        else if (bg.channel == 1)
                            bg.channel = 3;
                        else if (bg.channel == 2)
                            bg.channel = 2;
                        else
                            bg.channel = 1;
                    }

                    if (!ttf) {
                        if (kv.img) {
                            charImg = this._itemsById[kv.img];
                            if (charImg != null) {
                                charImg.load();
                                bg.width = charImg.width;
                                bg.height = charImg.height;
                                bg.texture = charImg.texture;
                            }
                        }
                    }
                    else if (mainTexture != null) {
                        bg.texture = this.createSubTexture(mainTexture, new egret.Rectangle(bg.x + atlasOffsetX, bg.y + atlasOffsetY, bg.width, bg.height));
                    }

                    if (ttf)
                        bg.lineHeight = size;
                    else {
                        if(bg.advance == 0) {
                            if(xadvance == 0)
                                bg.advance = bg.offsetX + bg.width;
                            else
                                bg.advance = xadvance;
                        }

                        bg.lineHeight = bg.offsetY < 0 ? bg.height : (bg.offsetY + bg.height);
                        if (bg.lineHeight < size)
                            bg.lineHeight = size;
                    }
                    font.glyphs[String.fromCharCode(kv.id)] = bg;
                }
                else if (str == "info") {
                    ttf = kv.face != null;
                    if(!isNaN(kv.size))
                        size = parseInt(kv.size);
                    resizable = kv.resizable == "true";
                    if (ttf) {
                        var sprite: AtlasSprite = this._sprites[item.id];
                        if (sprite != null) {
                            atlasOffsetX = sprite.rect.x;
                            atlasOffsetY = sprite.rect.y;
                            var atlasItem: PackageItem = this._itemsById[sprite.atlas];
                            if(atlasItem != null)
                                mainTexture = this.getItemAsset(atlasItem);
                        }
                    }
                }
                else if (str == "common") {
                    if(size==0 && !isNaN(kv.lineHeight))
                        size = parseInt(kv.lineHeight);
                    if(!isNaN(kv.xadvance))
                        xadvance = parseInt(kv.xadvance);
                }
            }
            
            if (size == 0 && bg)
                size = bg.height;

            font.ttf = ttf;
            font.size = size;
            font.resizable = resizable;
            item.bitmapFont = font;
        }
    }

    class AtlasSprite {
        public constructor() {
            this.rect = new egret.Rectangle();
        }

        public atlas: string;
        public rect: egret.Rectangle;
        public rotated: boolean;
    }
}
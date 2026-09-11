local isEditor = (Amaz.Macros and Amaz.Macros.EditorSDK) and true or false
local exports = exports or {}
local TextAnim = TextAnim or {}
TextAnim.__index = TextAnim
---@class TextAnim : ScriptComponent
---@field autoPlay boolean
---@field duration number
---@field curTime number
---@field progress number [UI(Range={0, 1}, Slider)]

local function clamp(x, a, b)
    return math.max(math.min(x, b), a)
end

-- must exist for registing module
function TextAnim:_registerModule(_module_path)
    local module = includeRelativePath(_module_path)
    if module and module.TEXT_STICKER then
        module = module.new(self)
    end
    return module
end

function TextAnim.getAEData()
    local aeTools = includeRelativePath("modules/AETools")
    local aeData = includeRelativePath("modules/AEData")
    local attrs = aeTools.new(aeData.ae_attribute)
    return attrs
end

function TextAnim.new()
    local self = setmetatable({}, TextAnim)

    local sticker = includeRelativePath("modules/TextSticker")
    setmetatable(TextAnim, sticker)
    setmetatable(self, TextAnim)

    -- vat Attr ----
    self.registerModules = { "LetterStyleMergeModule", "CaptionModule", "TextCloneModule", "RenderModule", "Sprite2DModule" }

    self.seq_material = nil

    return self
end


function TextAnim:textStart(comp) 

    self.c_module = self:getModule("CaptionModule")
    self.attrs = self.getAEData()
    -- self.rootDir = getRootDir()
end
local function mix(a, b, x)
    return a * (1-x) + b * x
end

local function remap01(a,b,x)
    if x < a then return 0 end
    if x > b then return 1 end
    return (x-a)/(b-a)
end
function TextAnim:textInit()
    self.richText.canvas.renderToRT = false
    if isEditor then
    else
        self.renderer.material = self.material_template:instantiate()
    end
    self.material = self.renderer.material

    self.richText:forceTypeSetting()
    -- local canvasColor = self.richText.canvas.canvasColor 
    -- if canvasColor.x >= 0.99 and canvasColor.y >= 0.99 and canvasColor.z >= 0.99 then
    --     canvasColor:set(117/255, 52/255, 242/255, 1.0)
    -- end
    -- self.richText.canvas.canvasColor = canvasColor
    -- -- self.material:setVec4("u_canvasColor", canvasColor)
    -- self.richText.canvas.canvasEnabled = false
    -- self.c_module:init()
    self.c_module:splitPage(0, 1).wordCountPerPageLimit(3)
    self.capDuration = self.c_module:getDuration()
    local width = Amaz.BuiltinObject:getOutputTextureWidth()
    local height = Amaz.BuiltinObject:getOutputTextureHeight()
    local initLetters = self.richText.letters:clone()
    self.oriLetterSpacing = self.richText.typeSettingParam.letterSpacing


    local function isWhite(_letter)
        local col = _letter.letterStyle.letterColorRGBA
        return math.abs(col.r-1)<0.05 and math.abs(col.g-1)<0.05 and math.abs(col.b-1)<0.05
    end

    local readingPageFunc = function(_obj, _p, letters)

    end
    local beforeReadWordFunc = function(_obj, _p)
        local oriWordLetters = _obj:getOriLetters()
        for i = 1, #_obj.letters do
            -- local curInsColor = oriWordLetters[i].instanceColor
            -- _obj.letters[i].instanceColor = Amaz.Color(curInsColor.r, curInsColor.g, curInsColor.b, 0)
            -- _obj.letters[i].letterStyle.letterColorRGBA = oriWordLetters[i].letterStyle.letterColorRGBA
            _obj.letters[i].letterStyle.letterColorRGBA = Amaz.Color(1, 1, 1, oriWordLetters[i].letterStyle.letterColorRGBA.a)
        end
    end
    local readingWordFunc = function(_obj, _p)
        local oriWordLetters = _obj:getOriLetters()
        for i = 1, #_obj.letters do
            local curInsColor = oriWordLetters[i].instanceColor
            -- _obj.letters[i].instanceColor = Amaz.Color(curInsColor.r, curInsColor.g, curInsColor.b, _p)
            if isWhite(oriWordLetters[i]) then
                _obj.letters[i].letterStyle.letterColorRGBA = Amaz.Color(1,1,0,1)
            else
                _obj.letters[i].letterStyle.letterColorRGBA = oriWordLetters[i].letterStyle.letterColorRGBA

            end
        end

    end
    local afterReadWordFunc = function(_obj, _p)
        local oriWordLetters = _obj:getOriLetters()
        for i = 1, #_obj.letters do
            -- local curInsColor = oriWordLetters[i].instanceColor
            -- _obj.letters[i].instanceColor = Amaz.Color(curInsColor.r, curInsColor.g, curInsColor.b, 1)
            -- _obj.letters[i].letterStyle.letterColorRGBA = oriWordLetters[i].letterStyle.letterColorRGBA
            _obj.letters[i].letterStyle.letterColorRGBA = Amaz.Color(1, 1, 1, oriWordLetters[i].letterStyle.letterColorRGBA.a)
        end

    end


    local pages = self.c_module:getPages()
    for i = 1, #pages do
        pages[i]:setReadingAnim(readingPageFunc)
        pages[i]:setWordBeforeReadAnim(beforeReadWordFunc)
        pages[i]:setWordReadingAnim(readingWordFunc)
        pages[i]:setWordAfterReadAnim(afterReadWordFunc)
    end

end

local function clamp(x, a, b)
    return math.min(math.max(x, a), b)
end

function TextAnim:textSeek(_time)

    local time = _time
    if isEditor then
        -- time = 4 * self.progress
        self.progress = clamp((_time % self.capDuration) / self.capDuration, 0.0, 1.0)
    else
        self.progress = clamp(_time / math.min(self.capDuration, 0.2), 0.0, 1.0)
    end
    local page, word = self.c_module:animing(_time % self.capDuration)
    if page == nil then
        return 
    end
end

function TextAnim:textReset()
    self.richText.typeSettingParam.letterSpacing = self.oriLetterSpacing
end

exports.TextAnim = TextAnim
return exports
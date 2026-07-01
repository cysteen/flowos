import{Vt as e}from"./config-provider-Cjprxth4.js";var t=!1;try{let e=Object.defineProperty({},"passive",{get(){t=!0}});window.addEventListener(`testPassive`,null,e),window.removeEventListener(`testPassive`,null,e)}catch{}var n=t;function r(e,t,r,i){if(e&&e.addEventListener){let a=i;a===void 0&&n&&(t===`touchstart`||t===`touchmove`||t===`wheel`)&&(a={passive:!1}),e.addEventListener(t,r,a)}return{remove:()=>{e&&e.removeEventListener&&e.removeEventListener(t,r)}}}var i=`accept acceptcharset accesskey action allowfullscreen allowtransparency
alt async autocomplete autofocus autoplay capture cellpadding cellspacing challenge
charset checked classid classname colspan cols content contenteditable contextmenu
controls coords crossorigin data datetime default defer dir disabled download draggable
enctype form formaction formenctype formmethod formnovalidate formtarget frameborder
headers height hidden high href hreflang htmlfor for httpequiv icon id inputmode integrity
is keyparams keytype kind label lang list loop low manifest marginheight marginwidth max maxlength media
mediagroup method min minlength multiple muted name novalidate nonce open
optimum pattern placeholder poster preload radiogroup readonly rel required
reversed role rowspan rows sandbox scope scoped scrolling seamless selected
shape size sizes span spellcheck src srcdoc srclang srcset start step style
summary tabindex target title type usemap value width wmode wrap onCopy onCut onPaste onCompositionend onCompositionstart onCompositionupdate onKeydown
    onKeypress onKeyup onFocus onBlur onChange onInput onSubmit onClick onContextmenu onDoubleclick onDblclick
    onDrag onDragend onDragenter onDragexit onDragleave onDragover onDragstart onDrop onMousedown
    onMouseenter onMouseleave onMousemove onMouseout onMouseover onMouseup onSelect onTouchcancel
    onTouchend onTouchmove onTouchstart onTouchstartPassive onTouchmovePassive onScroll onWheel onAbort onCanplay onCanplaythrough
    onDurationchange onEmptied onEncrypted onEnded onError onLoadeddata onLoadedmetadata
    onLoadstart onPause onPlay onPlaying onProgress onRatechange onSeeked onSeeking onStalled onSuspend onTimeupdate onVolumechange onWaiting onLoad onError`.split(/[\s\n]+/),a=`aria-`,o=`data-`;function s(e,t){return e.indexOf(t)===0}function c(t){let n=arguments.length>1&&arguments[1]!==void 0?arguments[1]:!1,r;r=n===!1?{aria:!0,data:!0,attr:!0}:n===!0?{aria:!0}:e({},n);let c={};return Object.keys(t).forEach(e=>{(r.aria&&(e===`role`||s(e,a))||r.data&&s(e,o)||r.attr&&(i.includes(e)||i.includes(e.toLowerCase())))&&(c[e]=t[e])}),c}var l=e=>({animationDuration:e,animationFillMode:`both`}),u=e=>({animationDuration:e,animationFillMode:`both`}),d=function(t,n,r,i){let a=arguments.length>4&&arguments[4]!==void 0&&arguments[4]?`&`:``;return{[`
      ${a}${t}-enter,
      ${a}${t}-appear
    `]:e(e({},l(i)),{animationPlayState:`paused`}),[`${a}${t}-leave`]:e(e({},u(i)),{animationPlayState:`paused`}),[`
      ${a}${t}-enter${t}-enter-active,
      ${a}${t}-appear${t}-appear-active
    `]:{animationName:n,animationPlayState:`running`},[`${a}${t}-leave${t}-leave-active`]:{animationName:r,animationPlayState:`running`,pointerEvents:`none`}}};export{n as i,c as n,r,d as t};
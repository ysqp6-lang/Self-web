/* 作品与简历的折叠记录：锚点进来时展开，打印时展开全部再还原。 */
(function () {
    function openHash() {
        var raw = location.hash.slice(1);
        if (!raw) return;
        var id = raw;
        try { id = decodeURIComponent(raw); } catch (e) { /* 保留原样 */ }
        var el = document.getElementById(id);
        if (!el) return;
        var node = el;
        while (node) {
            if (node.tagName === "DETAILS") node.open = true;
            node = node.parentElement;
        }
    }

    var previous = null;

    openHash();
    window.addEventListener("hashchange", openHash);
    window.addEventListener("beforeprint", function () {
        previous = [];
        document.querySelectorAll("details").forEach(function (item) {
            previous.push(item.open);
            item.open = true;
        });
    });
    window.addEventListener("afterprint", function () {
        if (!previous) return;
        document.querySelectorAll("details").forEach(function (item, index) {
            item.open = previous[index];
        });
        previous = null;
    });
})();

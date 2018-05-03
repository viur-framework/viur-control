"use strict";
const $ = require('jquery');
const {clipboard, ipcRenderer} = require('electron');

function topicSelected(event, ) {
  let viewId = $(event.currentTarget).data("view");
  $(".topic").removeClass("active");
  $(".content").removeClass("active").animate({
    scrollTop: 60
  });
  $(this).addClass("active");
  $(viewId).addClass("active");
}

function activateData(view) {
  if (!!view) {
    let topic = $(`.topic[data-view="${view}"]`);
    if (topic.length == 1) {
      console.log("activateData topic", topic);
      $(topic).trigger("click");
    } else {
      let viewElement = $(view);
      console.log("activateData viewElement", viewElement);
      let content = $(viewElement).parents(".content");
      $(`.topic[data-view="#${content.prop("id")}"]`).trigger("click");
      setTimeout(function () {
        $(content).animate({
          scrollTop: viewElement.offset().top-20
        });
      }, 200);
    }
  }
}

ipcRenderer.on("start", function(event, view, userDir) {
  console.log("start", view, userDir);
  $("title").text(`ViUR Control - Documentation`);
  $(".topic").on("click", topicSelected);
  $(".js-close").on("click", window.close);
  $(".js-user-config-dir").text(userDir);
  activateData(view);
});

ipcRenderer.on("change", function (event, view) {
  console.log("change", view);
  activateData(view);
});
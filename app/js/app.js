var bucketName = "com.danillolima2";
var bucketRegion = "us-east-1";
var IdentityPoolId = "us-east-1:3ad08f52-e99b-40b7-994c-3bd748a12771";

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: "2015-12-08",
  params: { Bucket: bucketName }
});

var sqs = new AWS.SQS({apiVersion: '2012-11-05'});

var params = {
  QueueName: 'cenourinhas'
};

var queueURL;
sqs.getQueueUrl(params, function(err, data) {
  if (err) {
    console.log("Error", err);
  } else {
    console.log("Success", data.QueueUrl);
    queueURL = data.QueueUrl;
  }
});

function getHtml(template) {
  return template.join('\n');
}
listFolders();

function createFolder(folderName) {
  folderName = folderName.trim();
  if (!folderName) {
    return alert("Pastas precisam ter pelo menos um caractere que não seja espaço");
  }
  if (folderName.indexOf("/") !== -1) {
    return alert("Pastas não podem ter / ");
  }
  var folderKey = encodeURIComponent(folderName) + "/";
  s3.headObject({ Key: folderKey }, function(err, data) {
    if (!err) {
      return alert("Nome de pasta já existe.");
    }
    if (err.code !== "NotFound") {
      return alert("Ocorreu um erro criando sua pasta ='( : " + err.message);
    }
    s3.putObject({ Key: folderKey }, function(err, data) {
      if (err) {
        return alert("Ocorreu um erro criando sua pasta ='( : " + err.message);
      }
      alert("Pasta criada com sucesso");
      viewFolder(folderName);
    });
  });
}

function deleteFile(albumName, photoKey) {
  s3.deleteObject({ Key: photoKey }, function(err, data) {
    if (err) {
      return alert("Ocorreu um erro deletando um arquivo: ", err.message);
    }
    alert("Arquivo deletado.");
    viewFolder(albumName);
  });
}

function htmlPrev(uri){
  let ext = uri.split('.').pop();
  if(ext == 'png' || ext == 'jpg' || ext == 'gif' || ext == 'jpeg'){
    return ["<img class=\"img-fluid\" src=\"" + uri + "\"/>",
            "<a href=\"" + uri + "\"> Download </a>"];
  }
  else if(ext == 'avi' || ext == 'mp4' || ext == 'mkv'){
    return ["<div class=\"embed-responsive embed-responsive-16by9\">",
            "<video src=\""+ uri + "\" controls>",
           "Seu navegador não suporta o elemento <code>video</code>",
           "</video></div>",
           "<a href=\"" + uri + "\"> Download </a>"
          ]
  }
  else{
    return '<a href="' + uri + '"> Download </a>'
  }
}

function viewFolder(folderName) {
  var folderPhotosKey = encodeURIComponent(folderName) + "//";
  s3.listObjects({ Prefix: folderPhotosKey }, function(err, data) {
    if (err) {
      return alert("Ocorreu um erro abrindo a pasta " + err.message);
    }
    // 'this' references the AWS.Response instance that represents the response
    var href = this.request.httpRequest.endpoint.href;
    var bucketUrl = href + bucketName + "/";

    var photos = data.Contents.map(function(photo) {
      var photoKey = photo.Key;
      var photoUrl = bucketUrl + encodeURIComponent(photoKey);
      return getHtml([
        "<div class=\"card\">",
        htmlPrev(photoUrl),
        "<div>",
        "<button onclick=\"deleteFile('" +
          folderName +
          "','" +
          photoKey +
          "')\">",
          "Excluir",
          "<span class=\"oi oi-delete\" title=\"icon name\" aria-hidden=\"true\"></span>",
        "</button>",
        "<span style=\"overflow-wrap: break-word;\">",
        photoKey.replace(folderPhotosKey, ""),
        "</span>",
        "</div>",
        "</div>",
      ]);
    });
    var message = photos.length
      ? "<p>Quantidade de arquivos: "+photos.length+"</p>"
      : "<p>Você não tem arquivos nessa pasta.</p>";
    var htmlTemplate = [
      "<h2>",
      "Pasta: " + folderName,
      "</h2>",
      message,
      '<input id="photoupload" type="file" accept="*">',
      '<button id="addphoto" onclick="addPhoto(\'' + folderName + "')\">",
      "Enviar arquivo",
      "</button>",
      '<button onclick="listFolders()">',
      "<span class=\"oi oi-chevron-left\" title=\"icon name\"> Voltar para pastas",
      "</button>",
      "<div class=\"pt-5 card-columns\">",
      getHtml(photos),
      "</div>"
    ];
    document.getElementById("app").innerHTML = getHtml(htmlTemplate);
  });
}

function addPhoto(folderName) {
  var files = document.getElementById("photoupload").files;
  if (!files.length) {
    return alert("Escolha uma arquivo antes!");
  }
  var file = files[0];
  var fileName = file.name;
  var folderPhotosKey = encodeURIComponent(folderName) + "//";
  var photoKey = folderPhotosKey + fileName;
  // Use S3 ManagedUpload class as it supports multipart uploads
  var upload = new AWS.S3.ManagedUpload({
    params: {
      Bucket: bucketName,
      Key: photoKey,
      Body: file,
      ACL: "public-read"
    }
  });
  var promise = upload.promise();
  promise.then(
    function(data) {
      console.log(data)
      var params = {
        DelaySeconds: 10,
        MessageAttributes: {},
        MessageBody: JSON.stringify ({'url' : data.Location,
                      'bucket' : data.Bucket}),
        // MessageDeduplicationId: "TheWhistler",  // Required for FIFO queues
        // MessageId: "Group1",  // Required for FIFO queues
        QueueUrl: queueURL
      };
      sqs.sendMessage(params, function(err, data) {
        if (err) {
          console.log("Error", err);
        } else {
          console.log("Success", data.MessageId);
        }
      });
      alert("Arquivo salvo");
      viewFolder(folderName);
    },
    function(err) {
      return alert("Houve um erro fazendo upload do seu arquivo: ", err.message);
    }
  );
}
function popupCenourinha(msg){

}
function listFolders() {
  s3.listObjects({ Delimiter: "/" }, function(err, data) {
    if (err) {
      return alert("Aconteceu um erro listando as pastas: " + err.message);
    } else {
      var folders = data.CommonPrefixes.map(function(commonPrefix, i) {
        var prefix = commonPrefix.Prefix;
       
        var folderName = decodeURIComponent(prefix.replace("/", ""));
        if(folderName == 'app'){
          return;
        }else{
          i++;
        }
        return getHtml([
          "<tr>",
          "<th scope=\"row\">" + i  + "</th>",
          "<td><a href=\"javascript:;\" onclick=\"viewFolder('" + folderName + "')\">"+ folderName +"</a></td>",
          "<td><button onclick=\"deleteFolder('" + folderName + "')\">Deletar <span class=\"oi oi-delete\"></span> </span></td>",
          "</tr>"
        ]);
      });
      var message = folders.length
        ? getHtml([
            
          ])
        : "<p>Sem pastas no servidor</p>";
      var htmlTemplate = [
        "<div class=\"text-center\">",
        "<h1>Cenourinha files🥕📁</h1>",
       // "Upload de arquivos",
        //"<form method=\"POST\" action=\"http://com.danillolima.s3.amazonaws.com/\" enctype=\"multipart/form-data\">",
       // "   <input type=\"file\">",
       // "   <input type=\"submit\">",
      //  "</form>",
        "</div>",
        message,
        "<h3>Arquivos armazenados:</h3>",
        "<table class=\"table table-dark\">",
              "<thead>",
                  "<tr><th style=\"width: 16.66%; min-width: 129px;\"><button onclick=\"createFolder(prompt('Digite o nome da pasta:'))\">",
                  "Criar nova pasta",
                  "</button>",
                  "</th><th>Pasta</th><th></th></tr>",
            "</thead>",
        getHtml(folders),
        "</table>",
        "<footer>",
        "Exemplo adaptado apartir de: https://docs.aws.amazon.com/pt_br/sdk-for-javascript/v2/developer-guide/s3-example-photo-album.html",
        "</footer>"
        
      ];
      document.getElementById("app").innerHTML = getHtml(htmlTemplate);
    }
  });
}
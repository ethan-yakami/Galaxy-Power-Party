const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('..', 'avatars');
if (!fs.existsSync(targetPath)) {
  fs.mkdirSync(targetPath, { recursive: true });
}

// target characters with some possible alternative names
const targetChars = [
  '白厄', '三月七', '丹恒', '腾荒', '黄泉', '流萤', 
  '知更鸟', '卡芙卡', '砂金', '大黑塔', '花火', 
  '昔涟', '风堇', '爻光', '瑕蝶'
];

async function scan() {
  console.log("Fetching Fandom page...");
  const res = await fetch('https://honkai-star-rail.fandom.com/zh/wiki/Category:%E6%9B%B4%E6%8D%A2%E5%A4%B4%E5%83%8F', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const imagesFound = [];
  
  // Fandom category pages list files as gallery items
  $('.gallerybox').each((i, el) => {
    const text = $(el).find('.gallerytext').text().trim() || $(el).find('a').attr('title');
    const imgEl = $(el).find('img');
    let src = imgEl.attr('data-src') || imgEl.attr('src');
    
    if (src && text) {
        // Example text: "头像 三月七.png" or "头像 白厄.png"
        // Also it might say "大黑塔.png" etc.
        // Fandom thumbnails: "https://static.wikia.nocookie.net/.../scale-to-width-down/120..."
        // To get full size, remove "/scale-to-width-down/..."
        if (src.includes('/scale-to-width-down')) {
          src = src.split('/scale-to-width-down')[0];
        }
        if (src.includes('/revision/latest')) {
             src = src.substring(0, src.indexOf('/revision/latest') + '/revision/latest'.length);
        }

        for (const c of targetChars) {
            if (text.includes(c)) {
                imagesFound.push({ char: c, text, src });
                break;
            }
        }
    }
  });

  console.log(`Found ${imagesFound.length} matches in gallery boxes.`);
  
  // also check category members links (sometimes it's a list, not a gallery)
  $('.category-page__member-link').each((i, el) => {
      const title = $(el).attr('title'); // e.g. "File:头像 白厄.png"
      const href = $(el).attr('href'); // e.g. "/zh/wiki/File:..."
      if (title) {
          for (const c of targetChars) {
              if (title.includes(c)) {
                  imagesFound.push({ char: c, text: title, href: 'https://honkai-star-rail.fandom.com' + href });
                  break;
              }
          }
      }
  });

  console.log(`Matched ${imagesFound.length} URLs or pages so far.`);
  console.log(imagesFound);
}

scan();

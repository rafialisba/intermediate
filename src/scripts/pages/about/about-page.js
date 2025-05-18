import dev from "../../../images/fotodev.jpg";

export default class AboutPage {
    async render() {
        return `
      <section class="container about-section">
        <div>
        <h1>About Us</h1>
        <p>Aplikasi untuk membagikan cerita dengan format gambar, teks, dan map.</p>
        <p>Dibangun menggunakan Vanilla JS, vite sebagai build tools, css vanilla sebagai styling.</p>
        </div>

          <div class="about-description">
            <h2>Our Mission</h2>
            <p>Misi kami adalah menciptakan aplikasi sosial nomor satu. Menciptakan tempat dimana semua orang dapat membagikan momen berharganya dan memberitahu lokasinya!</p>
          </div>
          <div>
            <h2>Developer</h2>
            <p>Front End Developer: Rafi Alisba Garjita Sutrisno</p>
          </div>

          <div class="about-image">
            <img src=${dev} alt="Team photo" width="150px" />
          </div>

        <div class="contact-info">
          <h2>Contact Us</h2>
          <p>If you have any questions or inquiries, feel free to reach out to us:</p>
          <ul>
            <li>Email: alisbarafi7@gmail.com</li>
            <li>Phone: 00032932134</li>
            <li>Address: Jakarta Timur, Indonesia</li>
          </ul>
        </div>
      </section>
    `;
    }
}

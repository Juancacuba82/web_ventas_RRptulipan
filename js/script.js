document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinks = document.querySelectorAll('.nav-links li');

    burger.addEventListener('click', () => {
        nav.classList.toggle('nav-active');
        navLinks.forEach((link, index) => {
            if (link.style.animation) {
                link.style.animation = '';
            } else {
                link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
            }
        });
        burger.classList.toggle('toggle');
    });

    // SPA Navigation Logic
    const homeView = document.getElementById('home-view');
    const galleryView = document.getElementById('gallery-view');
    const navGallery = document.getElementById('nav-gallery');
    const footerGallery = document.querySelector('.footer-gallery');
    const logoHome = document.querySelectorAll('.logo-home');
    const homeLinks = document.querySelectorAll('.nav-link');

    const showView = (viewName) => {
        if (viewName === 'gallery') {
            homeView.style.display = 'none';
            galleryView.style.display = 'block';
            renderGallery();
            window.scrollTo(0, 0);
        } else {
            homeView.style.display = 'block';
            galleryView.style.display = 'none';
            window.scrollTo(0, 0);
        }
        // Close mobile menu if open
        if (nav.classList.contains('nav-active')) {
            burger.click();
        }
    };

    navGallery.addEventListener('click', (e) => {
        e.preventDefault();
        showView('gallery');
    });

    if (footerGallery) {
        footerGallery.addEventListener('click', (e) => {
            e.preventDefault();
            showView('gallery');
        });
    }

    logoHome.forEach(logo => {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            showView('home');
        });
    });

    homeLinks.forEach(link => {
        link.addEventListener('click', () => {
            showView('home');
        });
    });

    // Reveal on Scroll
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    // Navbar Scroll Effect
    const mainNav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            mainNav.style.padding = '10px 0';
            mainNav.style.backgroundColor = 'rgba(217, 4, 41, 0.95)';
        } else {
            mainNav.style.padding = '0';
            mainNav.style.backgroundColor = 'var(--primary-color)';
        }
    });

    // Form Submission Mock
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const originalBtnText = contactForm.querySelector('button').innerText;
            contactForm.querySelector('button').innerText = 'Message Sent!';
            contactForm.querySelector('button').style.backgroundColor = '#2ecc71';
            
            setTimeout(() => {
                contactForm.reset();
                contactForm.querySelector('button').innerText = originalBtnText;
                contactForm.querySelector('button').style.backgroundColor = 'var(--primary-color)';
            }, 3000);
        });
    }
});

// Additional Styles for Mobile Nav
const style = document.createElement('style');
style.textContent = `
    @media (max-width: 768px) {
        .nav-links {
            position: absolute;
            right: 0px;
            height: 92vh;
            top: 8vh;
            background-color: var(--primary-color);
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 50%;
            transform: translateX(100%);
            transition: transform 0.5s ease-in;
            z-index: 1000;
            padding-top: 50px;
        }
        .nav-links li { opacity: 0; margin: 20px 0; }
        .nav-active { transform: translateX(0%); }
        .burger { display: block; cursor: pointer; }
        .burger div { width: 25px; height: 3px; background-color: white; margin: 5px; transition: all 0.3s ease; }
        .toggle .line1 { transform: rotate(-45deg) translate(-5px, 6px); }
        .toggle .line2 { opacity: 0; }
        .toggle .line3 { transform: rotate(45deg) translate(-5px, -6px); }
        @keyframes navLinkFade {
            from { opacity: 0; transform: translateX(50px); }
            to { opacity: 1; transform: translateX(0); }
        }
    }
`;
document.head.appendChild(style);

function renderGallery() {
    const images = [
        'imgi_100_Diseno-sin-titulo-18-300x300.png', 'imgi_101_Diseno-sin-titulo-17-300x300.png',
        'imgi_102_Diseno-sin-titulo-16-300x300.png', 'imgi_103_Diseno-sin-titulo-14-300x300.png',
        'imgi_104_Diseno-sin-titulo-15-300x300.png', 'imgi_10_58-169x300.jpg',
        'imgi_110_Diseno-sin-titulo-5-300x300.png', 'imgi_116_Diseno-sin-titulo-10-300x300.png',
        'imgi_117_Diseno-sin-titulo-8-169x300.png', 'imgi_119_Diseno-sin-titulo-6-300x300.png',
        'imgi_11_57-169x300.jpg', 'imgi_120_Diseno-sin-titulo-4-300x300.png',
        'imgi_121_Diseno-sin-titulo-3-300x300.png', 'imgi_122_Diseno-sin-titulo-2-300x300.png',
        'imgi_123_Diseno-sin-titulo-169x300.png', 'imgi_124_Diseno-sin-titulo-1-169x300.png',
        'imgi_125_9-300x300.png', 'imgi_126_7-300x300.png', 'imgi_127_4-300x300.png',
        'imgi_128_3-300x300.png', 'imgi_12_56-169x300.jpg', 'imgi_13_55-169x300.jpg',
        'imgi_14_54-169x300.jpg', 'imgi_15_53-169x300.jpg', 'imgi_16_52-169x300.jpg',
        'imgi_17_51-169x300.jpg', 'imgi_18_50-169x300.jpg', 'imgi_19_49-169x300.jpg',
        'imgi_20_48-169x300.jpg', 'imgi_21_47-169x300.jpg', 'imgi_22_46-169x300.jpg',
        'imgi_23_45-169x300.jpg', 'imgi_24_44-169x300.jpg', 'imgi_25_43-169x300.jpg',
        'imgi_26_42-169x300.jpg', 'imgi_27_41-169x300.jpg', 'imgi_28_40-169x300.jpg',
        'imgi_29_39-169x300.jpg', 'imgi_30_38-169x300.jpg', 'imgi_31_37-169x300.jpg',
        'imgi_32_36-169x300.jpg', 'imgi_33_35-169x300.jpg', 'imgi_34_34-169x300.jpg',
        'imgi_35_33-169x300.jpg', 'imgi_36_32-169x300.jpg', 'imgi_37_31-169x300.jpg',
        'imgi_38_30-169x300.jpg', 'imgi_39_29-169x300.jpg', 'imgi_40_28-169x300.jpg',
        'imgi_41_27-169x300.jpg', 'imgi_42_26-169x300.jpg', 'imgi_43_25-169x300.jpg',
        'imgi_44_24-169x300.jpg', 'imgi_45_23-169x300.jpg', 'imgi_46_22-169x300.jpg',
        'imgi_47_21-169x300.jpg', 'imgi_48_20-169x300.jpg', 'imgi_49_19-169x300.jpg',
        'imgi_4_64-169x300.jpg', 'imgi_50_18-1-169x300.jpg', 'imgi_51_17-1-169x300.jpg',
        'imgi_52_16-1-169x300.jpg', 'imgi_53_15-1-169x300.jpg', 'imgi_54_14-1-169x300.jpg',
        'imgi_55_13-1-169x300.jpg', 'imgi_56_12-1-169x300.jpg', 'imgi_57_11-1-169x300.jpg',
        'imgi_58_10-1-169x300.jpg', 'imgi_59_9-1-169x300.jpg', 'imgi_5_63-169x300.jpg',
        'imgi_60_8-1-169x300.jpg', 'imgi_61_7-1-169x300.jpg', 'imgi_62_6-1-169x300.jpg',
        'imgi_63_5-1-169x300.jpg', 'imgi_64_4-1-169x300.jpg', 'imgi_65_3-1-169x300.jpg',
        'imgi_66_2-1-169x300.jpg', 'imgi_67_1-1-169x300.jpg', 'imgi_68_18-300x300.jpg',
        'imgi_69_17-300x300.jpg', 'imgi_6_62-169x300.jpg', 'imgi_70_16-300x300.jpg',
        'imgi_71_15-300x300.jpg', 'imgi_72_14-300x300.jpg', 'imgi_73_13-300x300.jpg',
        'imgi_74_12-300x300.jpg', 'imgi_75_11-300x300.jpg', 'imgi_76_10-300x300.jpg',
        'imgi_77_9-300x300.jpg', 'imgi_78_8-300x300.jpg', 'imgi_79_7-300x300.jpg',
        'imgi_7_61-169x300.jpg', 'imgi_80_6-300x300.jpg', 'imgi_81_5-300x300.jpg',
        'imgi_82_4-300x300.jpg', 'imgi_83_3-300x300.jpg', 'imgi_84_2-300x300.jpg',
        'imgi_85_1-300x300.jpg', 'imgi_86_Diseno-sin-titulo-24-300x300.png',
        'imgi_87_Diseno-sin-titulo-25-300x300.png', 'imgi_88_Diseno-sin-titulo-29-300x300.png',
        'imgi_89_services-fullfill-300x185.jpg', 'imgi_8_60-169x300.jpg',
        'imgi_90_services-finalmile-300x185.jpg', 'imgi_93_Diseno-sin-titulo-22-300x300.png',
        'imgi_94_Diseno-sin-titulo-23-300x300.png', 'imgi_95_Diseno-sin-titulo-26-300x300.png',
        'imgi_96_Diseno-sin-titulo-20-300x300.png', 'imgi_97_Diseno-sin-titulo-21-300x300.png',
        'imgi_98_Diseno-sin-titulo-19-300x300.png', 'imgi_98_Diseno-sin-titulo-19-300x300.png',
        'imgi_9_59-169x300.jpg'
    ];

    const galleryGridHTML = images.map(img => `
        <div class="gallery-item reveal active">
            <img src="assets/gallery/${img}" alt="Gallery Photo">
        </div>
    `).join('');

    const galleryView = document.getElementById('gallery-view');
    galleryView.innerHTML = `
        <header class="gallery-header">
            <div class="container">
                <h1>Our <span>Photo Gallery</span></h1>
                <p>Explore our containers and logistics operations</p>
            </div>
        </header>
        <main class="container">
            <section class="gallery-grid">
                ${galleryGridHTML}
            </section>
        </main>
    `;
    document.title = "Photo Gallery | RP Tulipan Logistics";
}

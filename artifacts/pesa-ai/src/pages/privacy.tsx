export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: August 2026 · Adplay Media Ltd</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">1. Who We Are</h2>
          <p className="text-gray-600 leading-relaxed">
            Pesa AI is a product of <strong>Adplay Media Ltd</strong>, a company registered in Kenya.
            We provide an AI-powered WhatsApp sales assistant platform for Kenyan small and medium businesses.
            Contact us at <a href="mailto:info@pesaai.africa" className="text-green-600 underline">info@pesaai.africa</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">2. Information We Collect</h2>
          <ul className="list-disc pl-5 text-gray-600 space-y-2 leading-relaxed">
            <li><strong>Business owners:</strong> Name, email address, phone number, business name, and business category collected during signup.</li>
            <li><strong>Customers (via WhatsApp):</strong> WhatsApp phone number and message content sent to a connected business. We do not collect personal profiles or contact lists.</li>
            <li><strong>Payment details:</strong> M-Pesa paybill or till numbers entered by business owners. We do not store card numbers or bank account credentials.</li>
            <li><strong>Usage data:</strong> Order records, product catalogue entries, and conversation logs associated with each business account.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 text-gray-600 space-y-2 leading-relaxed">
            <li>To operate the AI assistant and generate automated replies to customer WhatsApp messages on behalf of the business.</li>
            <li>To process and track orders placed through WhatsApp conversations.</li>
            <li>To provide business owners with a dashboard showing orders, products, and sales activity.</li>
            <li>To send platform notifications and subscription billing reminders.</li>
            <li>We do <strong>not</strong> sell your data to third parties or use it for advertising.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">4. WhatsApp &amp; Meta</h2>
          <p className="text-gray-600 leading-relaxed">
            Pesa AI uses the WhatsApp Business Platform (Meta Platforms, Inc.) to send and receive messages.
            Messages are transmitted through Meta's infrastructure. By interacting with a Pesa AI–powered
            business on WhatsApp, your messages are subject to Meta's{" "}
            <a href="https://www.whatsapp.com/legal/privacy-policy" className="text-green-600 underline" target="_blank" rel="noopener noreferrer">
              WhatsApp Privacy Policy
            </a>{" "}
            in addition to this policy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">5. Data Sharing</h2>
          <p className="text-gray-600 leading-relaxed">
            We share data only as necessary to operate the platform:
          </p>
          <ul className="list-disc pl-5 text-gray-600 space-y-2 leading-relaxed mt-2">
            <li><strong>Anthropic (Claude AI):</strong> Customer message content is sent to Anthropic's API to generate AI responses. Anthropic's data handling is governed by their privacy policy.</li>
            <li><strong>Safaricom (M-Pesa):</strong> Payment confirmation data is exchanged with Safaricom's Daraja API for businesses that have enabled M-Pesa integration.</li>
            <li><strong>Replit Inc.:</strong> Our platform is hosted on Replit's cloud infrastructure.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">6. Data Retention</h2>
          <p className="text-gray-600 leading-relaxed">
            Business account data is retained for as long as the account is active. Conversation logs are
            retained for up to 90 days for support and quality purposes. Business owners may request deletion
            of their account and associated data by contacting us.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">7. Data Deletion</h2>
          <p className="text-gray-600 leading-relaxed">
            You may request deletion of your data at any time by emailing{" "}
            <a href="mailto:info@pesaai.africa" className="text-green-600 underline">info@pesaai.africa</a>.
            We will process deletion requests within 30 days. Some data may be retained where required by
            Kenyan law or legitimate business records obligations.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">8. Security</h2>
          <p className="text-gray-600 leading-relaxed">
            Sensitive credentials (such as M-Pesa API keys) are encrypted at rest using AES-256-GCM.
            All data is transmitted over HTTPS. Access to business data is restricted to authenticated
            account holders and Adplay Media Ltd platform administrators.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">9. Your Rights</h2>
          <p className="text-gray-600 leading-relaxed">
            You have the right to access, correct, or delete personal data we hold about you.
            To exercise these rights, contact us at{" "}
            <a href="mailto:info@pesaai.africa" className="text-green-600 underline">info@pesaai.africa</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">10. Changes to This Policy</h2>
          <p className="text-gray-600 leading-relaxed">
            We may update this policy from time to time. Material changes will be communicated to business
            owners via email. Continued use of the platform after changes constitutes acceptance.
          </p>
        </section>

        <div className="border-t border-gray-200 pt-8 mt-8">
          <p className="text-sm text-gray-500">
            <strong>Adplay Media Ltd</strong> · Nairobi, Kenya ·{" "}
            <a href="mailto:info@pesaai.africa" className="text-green-600 underline">info@pesaai.africa</a>
          </p>
        </div>
      </div>
    </div>
  );
}

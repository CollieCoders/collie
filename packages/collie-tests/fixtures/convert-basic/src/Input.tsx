type Props = {
  name: string;
};

export default function Input({ name }: Props) {
  return (
    <div className="greeting" data-id="welcome">
      <h1>Hello {name}</h1>
      <p>Thanks for visiting.</p>
    </div>
  );
}

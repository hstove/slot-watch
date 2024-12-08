import ReactCountdown from 'react-countdown';

export const Countdown = ({ date }: { date: string }) => {
  return (
    <ReactCountdown
      date={date}
      overtime={true}
      renderer={({ minutes, seconds }) => {
        return (
          <>
            {minutes.toString().padStart(2, '0')}:
            {seconds.toString().padStart(2, '0')}
          </>
        );
      }}
    />
  );
};
